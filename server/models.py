from __future__ import annotations

from enum import StrEnum
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator


class InterviewFormat(StrEnum):
    BEHAVIORAL = "Behavioral / competency"
    TECHNICAL = "Technical"
    HR = "HR / recruiter"
    CASE = "Case study"
    SYSTEM_DESIGN = "System design"


class SourceMode(StrEnum):
    OLLAMA = "ollama"
    PUBLIC = "public"
    MIX = "mix"


class QuestionSource(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=4, max_length=600)
    source: Literal["custom", "reported"] = "custom"
    title: str | None = Field(default=None, max_length=300)
    url: str | None = Field(default=None, max_length=2000)
    host: str | None = Field(default=None, max_length=255)

    @field_validator("url")
    @classmethod
    def validate_source_url(cls, value: str | None) -> str | None:
        if value:
            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Source links must be ordinary HTTP or HTTPS URLs.")
        return value


class SearchRequest(BaseModel):
    company: str | None = Field(default=None, max_length=120)
    role: str = Field(min_length=2, max_length=120)
    interview_format: InterviewFormat
    limit: int = Field(default=5, ge=1, le=8)


class SessionCreate(BaseModel):
    role: str = Field(min_length=2, max_length=120)
    level: str = Field(min_length=2, max_length=80)
    interview_format: InterviewFormat
    source_mode: SourceMode
    company: str | None = Field(default=None, max_length=120)
    question_count: int = Field(default=6, ge=1, le=20)
    custom_questions: list[str] = Field(default_factory=list, max_length=20)
    selected_public_questions: list[QuestionSource] = Field(default_factory=list, max_length=24)
    tone: Literal["friendly", "neutral", "challenging"] = "friendly"
    model: str = Field(default="qwen2.5:3b", min_length=1, max_length=120)

    @field_validator("custom_questions")
    @classmethod
    def validate_custom_questions(cls, questions: list[str]) -> list[str]:
        if any(len(question.strip()) < 4 or len(question) > 600 for question in questions):
            raise ValueError("Each custom question must be between 4 and 600 characters.")
        return [question.strip() for question in questions]


class AnswerRequest(BaseModel):
    answer: str = Field(default="", max_length=12000)


class SkipRequest(BaseModel):
    pass


class ToneUpdate(BaseModel):
    tone: Literal["friendly", "neutral", "challenging"]
