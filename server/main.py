from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .models import AnswerRequest, SearchRequest, SessionCreate, ToneUpdate
from .services import ollama, public_search, transcription
from .session_store import InterviewSession, create_session, get_session, remove_session

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CLIENT_BUILD = PROJECT_ROOT / "client" / "dist" / "client"

app = FastAPI(title="Interview Booth", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "127.0.0.1:8000", "localhost:8000"])


class RequestBodyLimitMiddleware:
    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return
        path = scope.get("path", "")
        limit = 21 * 1024 * 1024 if path == "/api/transcribe" else 1024 * 1024
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        declared = headers.get(b"content-length")
        if declared:
            try:
                too_large = int(declared) > limit
            except ValueError:
                too_large = True
            if too_large:
                body = b'{"detail":"Request body is too large or has an invalid content length."}'
                await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": body})
                return
        chunks = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                body = b'{"detail":"Request body is too large."}'
                await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": body})
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        replayed = False

        async def replay_receive():
            nonlocal replayed
            if replayed:
                return {"type": "http.disconnect"}
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.application(scope, replay_receive, send)


app.add_middleware(RequestBodyLimitMiddleware)

@app.middleware("http")
async def local_request_guard(request, call_next):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
        allowed_origins = {
            "http://127.0.0.1:8000", "http://localhost:8000",
            "http://127.0.0.1:5173", "http://localhost:5173",
        }
        if origin not in allowed_origins:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "Cross-origin requests are not accepted."})
    return await call_next(request)


def _question_view(question: dict | None) -> dict | None:
    if question is None:
        return None
    safe = {key: question.get(key) for key in ("id", "text", "source", "title", "url", "host")}
    return {key: value for key, value in safe.items() if value is not None}


def _session_view(session: InterviewSession) -> dict:
    return {
        "id": session.id,
        "role": session.role,
        "level": session.level,
        "interview_format": session.interview_format,
        "source_mode": session.source_mode,
        "company": session.company,
        "tone": session.tone,
        "model": session.model,
        "current_question": _question_view(session.current_question),
        "answered_count": session.answered_count,
        "question_count": session.question_count,
        "completed": session.completed,
        "feedback": session.feedback,
    }


async def _advance(session: InterviewSession, previous_answer: str = "") -> None:
    next_fixed = session.next_fixed_question
    if next_fixed:
        session.current_question = next_fixed
        return
    if session.source_mode == "public" or session.answered_count >= session.question_count:
        session.completed = True
        if session.source_mode == "public":
            session.feedback = {
                "mode": "self_review",
                "overall": "Use the checklist to review your examples. Public-question sessions do not send your answers to an AI model.",
                "scores": {},
                "strengths": [],
                "next_steps": [
                    "Did you answer the question directly?",
                    "Did you include a specific example and your own actions?",
                    "Did you explain the result or what you learned?",
                ],
            }
        else:
            session.feedback = await ollama.evaluate(session)
        session.current_question = None
        return
    question = await ollama.next_question(session, previous_answer)
    session.current_question = {"id": f"ollama-{session.answered_count + 1}", "text": question, "source": "ollama"}


def _get_or_404(session_id: str) -> InterviewSession:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="This interview session is no longer available.")
    return session


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "app": "Interview Booth"}


@app.get("/api/ollama/status")
async def ollama_status() -> dict:
    return await ollama.get_status()


@app.post("/api/questions/search")
async def search(request: SearchRequest) -> dict:
    return await run_in_threadpool(
        public_search.search_questions,
        request.company,
        request.role,
        request.interview_format.value,
        request.limit,
    )


@app.post("/api/sessions")
async def start_session(request: SessionCreate) -> dict:
    if request.source_mode.value == "public" and not request.custom_questions and not request.selected_public_questions:
        raise HTTPException(status_code=422, detail="Select at least one reported question or add a custom question.")
    session = create_session(request)
    try:
        await _advance(session)
    except ollama.OllamaError as exc:
        remove_session(session.id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return _session_view(session)


@app.get("/api/sessions/{session_id}/current")
async def current(session_id: str) -> dict:
    return _session_view(_get_or_404(session_id))


@app.post("/api/sessions/{session_id}/answer")
async def answer(session_id: str, request: AnswerRequest) -> dict:
    session = _get_or_404(session_id)
    if session.completed or not session.current_question:
        raise HTTPException(status_code=409, detail="This interview has already ended.")
    answer_text = request.answer.strip()
    if len(answer_text) < 2:
        raise HTTPException(status_code=422, detail="Add an answer before continuing, or use Skip question.")
    turn = {"question": session.current_question.copy(), "answer": answer_text}
    if session.turns and session.turns[-1]["question"]["id"] == session.current_question["id"]:
        session.turns[-1] = turn
    else:
        session.turns.append(turn)
    try:
        await _advance(session, answer_text)
    except ollama.OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return _session_view(session)


@app.post("/api/sessions/{session_id}/skip")
async def skip(session_id: str) -> dict:
    session = _get_or_404(session_id)
    if session.completed or not session.current_question:
        raise HTTPException(status_code=409, detail="This interview has already ended.")
    session.turns.append({"question": session.current_question.copy(), "answer": "[Skipped]"})
    try:
        await _advance(session)
    except ollama.OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return _session_view(session)


@app.post("/api/sessions/{session_id}/finish")
async def finish(session_id: str) -> dict:
    session = _get_or_404(session_id)
    if not session.completed:
        if session.source_mode == "public":
            session.feedback = {
                "mode": "self_review",
                "overall": "Review the answers you completed with the checklist below.",
                "scores": {},
                "strengths": [],
                "next_steps": ["Answer the prompt directly.", "Use a specific example.", "Explain your result or learning."],
            }
        else:
            try:
                session.feedback = await ollama.evaluate(session)
            except ollama.OllamaError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
        session.completed = True
        session.current_question = None
    return _session_view(session)


@app.put("/api/sessions/{session_id}/tone")
async def update_tone(session_id: str, request: ToneUpdate) -> dict:
    session = _get_or_404(session_id)
    if session.completed:
        raise HTTPException(status_code=409, detail="This interview has already ended.")
    session.tone = request.tone
    return _session_view(session)


@app.get("/api/sessions/{session_id}/export.md")
async def export_session(session_id: str) -> PlainTextResponse:
    session = _get_or_404(session_id)
    lines = [
        "# Mock interview summary", "", f"- Role: {session.role}", f"- Level: {session.level}",
        f"- Format: {session.interview_format}", f"- Question source: {session.source_mode}",
        f"- Company: {session.company or 'Not specified'}", f"- Completed answers: {session.answered_count}",
        "", "## Transcript", "",
    ]
    for index, turn in enumerate(session.turns, start=1):
        question = turn["question"]
        lines.extend([f"### {index}. {question['text']}", "", turn["answer"], ""])
        if question.get("url"):
            lines.extend([f"Source: [{question.get('title') or question.get('host')}]({question['url']})", ""])
    if session.feedback:
        lines.extend(["## Feedback", "", str(session.feedback.get("overall", "")), ""])
        scores = session.feedback.get("scores", {})
        for key, value in scores.items():
            lines.append(f"- {key.title()}: {value}/5")
        for heading, key in (("Strengths", "strengths"), ("Next steps", "next_steps")):
            values = session.feedback.get(key, [])
            if values:
                lines.extend(["", f"### {heading}", ""])
                lines.extend(f"- {value}" for value in values)
    return PlainTextResponse("\n".join(lines), headers={"Content-Disposition": 'attachment; filename="interview-summary.md"'})


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict:
    data = await file.read(transcription.MAX_AUDIO_BYTES + 1)
    if len(data) > transcription.MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recordings must be 20 MB or smaller.")
    try:
        text = await transcription.transcribe_audio(data, file.content_type or "")
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Local transcription is unavailable. You can still type your answer.") from exc
    return {"text": text, "status": "ready" if text else "empty"}


if CLIENT_BUILD.is_dir() and (CLIENT_BUILD / "index.html").is_file():
    app.mount("/", StaticFiles(directory=CLIENT_BUILD, html=True), name="client")
