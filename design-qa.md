# Interview Booth — Product Design QA

## Source and comparison

- Design direction: Product Design option 3, Interview Booth.
- Reference: `design/reference-option-3.png` (1488 × 1055 px).
- Browser view: Interview Booth running at `http://127.0.0.1:8000/`.
- Comparison viewport: 1488 × 1055 CSS px; device pixel ratio approximately 1.0.
- Compared state: interview setup with voice settings open; desktop layout.

## Visual result

The current setup screen follows the reference's dark navy canvas, cream typography, lime accents, serif interview headline, and two-column setup plus voice-controls composition. The extra left navigation and footer were removed after the first comparison because they competed with the reference composition. The latest live view showed no obvious P0, P1, or P2 visual mismatch at the desktop viewport. Copy and session state differ because this is the app's functional setup screen rather than the static reference state.

The live page screenshot was captured and visually reviewed through the Codex browser tool. That tool returned the image inline but did not provide a documented way to save it to a local screenshot path. Since this QA record requires a persistent implementation screenshot path, the final result is **blocked**.

## Interaction notes

- Manually exercised setup, custom-question entry, public-only session start, typed answer submission, final self-review, and return to an active session.
- The public-only flow worked without Ollama. Public question search returned linked source cards; custom questions remained available.
- Microphone permission and transcription were not exercised. Typed answers remained available.
- The responsive mobile voice drawer was not captured for this QA record.

## Follow-up observations

- The app currently says practice is stored only while the tab is open. The server actually retains its in-memory session until the process stops; Codex Security reported this retention mismatch alongside session-token exposure in access logs.
- Browser speech provider locality depends on the selected browser/OS voice; the app cannot guarantee every voice runs on-device.
- This build is a local web app served on loopback, not an installable native desktop package.
