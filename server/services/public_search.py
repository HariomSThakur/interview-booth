from __future__ import annotations

import re
from urllib.parse import urlparse
from uuid import uuid4

from ddgs import DDGS


def _clean_query_part(value: str) -> str:
    return re.sub(r"[^\w .&'+#-]", " ", value, flags=re.UNICODE).strip()[:120]


def extract_question_sentences(snippet: str) -> list[str]:
    candidates = re.split(r"(?<=[?.!])\s+|\n+", snippet)
    questions: list[str] = []
    for candidate in candidates:
        text = re.sub(r"\s+", " ", candidate).strip(" \t\r\n\"'“”")
        if len(text) < 12 or len(text) > 600:
            continue
        if "?" in text or re.match(
            r"^(tell me|describe|walk me through|how would you|what would you|why do you|why did you|give me an example|can you explain|what is|how do you)\b",
            text,
            flags=re.IGNORECASE,
        ):
            if not text.endswith("?"):
                text = text.rstrip(".") + "?"
            questions.append(text)
    return list(dict.fromkeys(questions))[:4]


def search_questions(company: str | None, role: str, interview_format: str, limit: int) -> dict:
    parts = ["interview questions", _clean_query_part(role), _clean_query_part(interview_format)]
    if company:
        parts.insert(1, _clean_query_part(company))
    query = " ".join(part for part in parts if part)
    try:
        raw_results = DDGS(timeout=7).text(query, max_results=limit)
    except Exception as exc:
        return {"results": [], "notice": f"Public search is unavailable right now ({type(exc).__name__}). Your own questions still work."}

    results: list[dict] = []
    for item in raw_results or []:
        title = str(item.get("title") or "Public interview discussion")[:300]
        url = str(item.get("href") or "")[:2000]
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            continue
        snippet = str(item.get("body") or "")[:2000]
        questions = extract_question_sentences(snippet)
        results.append({
            "id": uuid4().hex,
            "title": title,
            "url": url,
            "host": parsed.hostname[:255],
            "snippet": snippet,
            "questions": questions,
            "source": "reported",
        })
    notice = "Public reports are unverified. Review each source before selecting a question."
    if not results:
        notice = "No public results came back. Try a broader role or continue with your own questions."
    return {"results": results, "notice": notice}
