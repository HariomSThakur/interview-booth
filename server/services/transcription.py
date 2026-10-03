from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

MAX_AUDIO_BYTES = 20 * 1024 * 1024
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg",
    "audio/mp4", "audio/aac", "audio/flac", "application/octet-stream",
}
_model = None


def _transcribe_file(path: str) -> str:
    global _model
    from faster_whisper import WhisperModel

    if _model is None:
        name = os.environ.get("INTERVIEW_WHISPER_MODEL", "base")
        _model = WhisperModel(name, device="cpu", compute_type="int8")
    segments, _ = _model.transcribe(path, beam_size=3, vad_filter=True)
    return " ".join(segment.text.strip() for segment in segments).strip()


async def transcribe_audio(data: bytes, content_type: str) -> str:
    if not data:
        raise ValueError("The recording was empty. Try again or type your answer.")
    if len(data) > MAX_AUDIO_BYTES:
        raise ValueError("Recordings must be 20 MB or smaller.")
    if content_type.lower().split(";")[0] not in ALLOWED_AUDIO_TYPES:
        raise ValueError("This audio format is not supported. Try browser recording or type your answer.")
    suffix = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/wav": ".wav"}.get(content_type.split(";")[0], ".audio")
    handle = tempfile.NamedTemporaryFile(prefix="interview-", suffix=suffix, delete=False)
    path = Path(handle.name)
    try:
        with handle:
            handle.write(data)
        return await asyncio.to_thread(_transcribe_file, str(path))
    finally:
        path.unlink(missing_ok=True)
