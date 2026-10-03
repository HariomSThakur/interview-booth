# Interview Booth

Interview Booth is a local-first mock interviewer with spoken questions, configurable delivery, optional microphone transcription, public interview-question search, and optional Ollama feedback.

## What you can do

- Practice behavioral, technical, recruiter, case-study, and system-design interviews.
- Choose public reports, local Ollama, or a mix. Public-only sessions work without Ollama and never send answers to a model.
- Search public result snippets for a company and role, review the source links, and choose question sentences. Results are unverified reports, not official company records.
- Add, edit, remove, and reorder up to 20 of your own questions.
- Hear each question using the browser's speech voice. Adjust voice, language, speed, pitch, volume, and friendly / neutral / challenging tone.
- Type answers or record them and transcribe locally with faster-whisper. Review and edit the transcript before you submit it.
- Pause, skip, end, review the transcript, and download a Markdown session summary.

## Run locally on Windows

Install Python 3.11 or later and Node.js 18 or later. For local AI features, install [Ollama for Windows](https://ollama.com/download/windows).

From this project folder, create an environment and install the Python packages:

~~~powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
~~~

Install the browser app packages and build the local UI:

~~~powershell
cd client
npm install
npm run build
cd ..
~~~

For AI interviews, start Ollama and download a local model once:

~~~powershell
ollama pull qwen2.5:3b
~~~

The qwen2.5:3b model is about 1.9 GB in the Ollama library. You can also use a model already installed in Ollama; choose it in the setup screen.

Start Interview Booth:

~~~powershell
.\start.ps1
~~~

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The server binds to loopback only. Stop it with Ctrl+C.

### Public-only practice

Public reports do not require Ollama or an API key. They do need an internet connection for search. Search can also be skipped: add at least one custom question and start a public-only session. Public-only sessions do not call Ollama, even when it is running.

### Speech and transcription

Question playback uses voices supplied by the browser and operating system. Available voices vary by device. Microphone recording requires browser permission. If recording is unavailable, use the answer text box.

The first transcription may download the faster-whisper base model. That model runs on the local computer; recordings are deleted from the temporary directory after transcription. If the model is unavailable, you can continue by typing. Set the INTERVIEW_WHISPER_MODEL environment variable before launch to use another faster-whisper model size.

## Privacy boundary

- The interface and FastAPI server run on your computer at 127.0.0.1.
- Candidate answers stay in the local in-memory session and are sent only to your local Ollama service when you choose Ollama or Mix mode.
- Public search sends only the optional company name, role, and interview format to the DDGS search provider. It does not send candidate answers.
- Public-only mode never contacts Ollama. It provides a self-review checklist rather than AI feedback.
- Audio is uploaded only to this local server and transcribed with faster-whisper on your computer.
- Sessions are held in memory and are lost when the app stops or the tab is closed. Download the Markdown summary to keep a copy.
- No account, API key, hosted database, or cloud model is required.

## Troubleshooting

**Ollama is not detected:** Start the Ollama app, confirm a model is installed (ollama list), then refresh Interview Booth. Public-only mode remains available.

**The model is missing:** In a terminal, run ollama pull qwen2.5:3b, wait for it to finish, and refresh the page.

**Public search is empty or offline:** Try a broader role or remove the company name. Search results come from accessible public snippets and may not contain exact question sentences. Add your own questions to continue.

**The microphone is denied or unsupported:** Allow microphone use for the local page and try again, or type the answer. Speech playback is independent of microphone recording.

**Transcription is unavailable:** Keep typing your answer. The Whisper model is loaded only when the first recording is submitted; its first download requires an internet connection.

**Port 8000 is already in use:** Stop the other local service using that port before starting Interview Booth.

## Project structure

- client/ — Vite, React, browser voice controls, and the Interview Booth interface.
- server/ — FastAPI routes, single-user in-memory session, DDGS search, Ollama client, and local audio transcription.
- design/reference-option-3.png — design comparison reference only; it is not served by the app.
- design-qa.md — visual QA record.
