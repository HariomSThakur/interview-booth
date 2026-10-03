from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

from .models import SessionCreate


@dataclass
class InterviewSession:
    id: str
    role: str
    level: str
    interview_format: str
    source_mode: str
    company: str | None
    question_count: int
    tone: str
    model: str
    fixed_questions: list[dict]
    current_question: dict | None = None
    turns: list[dict] = field(default_factory=list)
    feedback: dict | None = None
    completed: bool = False
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def answered_count(self) -> int:
        return len(self.turns)

    @property
    def next_fixed_question(self) -> dict | None:
        if self.answered_count < len(self.fixed_questions):
            return self.fixed_questions[self.answered_count]
        return None


_sessions: dict[str, InterviewSession] = {}


def create_session(request: SessionCreate) -> InterviewSession:
    custom = [
        {"id": f"custom-{index + 1}", "text": text, "source": "custom"}
        for index, text in enumerate(request.custom_questions)
    ]
    reported = [question.model_dump() for question in request.selected_public_questions]
    if request.source_mode in {"public", "mix"}:
        fixed = custom + reported
    else:
        fixed = custom
    session = InterviewSession(
        id=uuid4().hex,
        role=request.role.strip(),
        level=request.level.strip(),
        interview_format=request.interview_format.value,
        source_mode=request.source_mode.value,
        company=request.company.strip() if request.company else None,
        question_count=max(request.question_count, len(fixed)),
        tone=request.tone,
        model=request.model.strip(),
        fixed_questions=fixed,
    )
    _sessions[session.id] = session
    return session


def get_session(session_id: str) -> InterviewSession | None:
    return _sessions.get(session_id)


def remove_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
