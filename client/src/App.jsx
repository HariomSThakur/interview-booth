import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Briefcase, Buildings, CaretDown, CaretUp, Check, CircleNotch, DownloadSimple, Globe, Headphones, Lightning, Microphone, MicrophoneSlash, Pause, Play, Plus, SlidersHorizontal, Sparkle, SpeakerHigh, Trash, Waveform, X } from "@phosphor-icons/react";

const FORMATS = ["Behavioral / competency", "Technical", "HR / recruiter", "Case study", "System design"];
const MODES = [
  { id: "public", title: "Public reports", detail: "Search reported questions · no AI needed", icon: Globe },
  { id: "ollama", title: "Ollama", detail: "Adaptive questions + private feedback", icon: Sparkle },
  { id: "mix", title: "Mix both", detail: "Public questions, then local AI follow-ups", icon: Lightning },
];
async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.detail || "Something went wrong. Please try again.");
  return payload;
}
const jsonOptions = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function App() {
  const [stage, setStage] = useState("setup");
  const [form, setForm] = useState({ role: "Product designer", level: "Mid-level", format: FORMATS[0], company: "", mode: "public", tone: "friendly", model: "qwen2.5:3b", count: 6 });
  const [customText, setCustomText] = useState("");
  const [custom, setCustom] = useState([]);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [notice, setNotice] = useState("");
  const [ollama, setOllama] = useState({ available: false, models: [] });
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(true);
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(.88);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const activeVoice = useMemo(() => voices.find((item) => item.voiceURI === voice), [voice, voices]);
  const question = session?.current_question;
  const progress = session ? Math.min(100, Math.round(session.answered_count * 100 / session.question_count)) : 0;
  const update = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (key === "tone" && session && !session.completed) {
      api("/api/sessions/" + session.id + "/tone", jsonOptions({ tone: value }))
        .then(setSession).catch((caught) => setError(caught.message));
    }
  };

  useEffect(() => {
    const refresh = () => setVoices(window.speechSynthesis?.getVoices?.() || []);
    refresh();
    window.speechSynthesis?.addEventListener?.("voiceschanged", refresh);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", refresh);
  }, []);
  useEffect(() => {
    if (form.mode === "public") return undefined;
    let active = true;
    api("/api/ollama/status").then((status) => { if (active) setOllama(status); })
      .catch(() => { if (active) setOllama({ available: false, models: [] }); });
    return () => { active = false; };
  }, [form.mode]);
  const speak = useCallback((text) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (activeVoice) utterance.voice = activeVoice;
    utterance.lang = language || activeVoice?.lang || "en-US";
    utterance.rate = Number(rate); utterance.pitch = Number(pitch); utterance.volume = Number(volume);
    window.speechSynthesis.speak(utterance);
  }, [activeVoice, language, pitch, rate, volume]);
  useEffect(() => {
    if (stage === "interview" && question) { setAnswer(""); speak(question.text); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, stage]);
  useEffect(() => {
    if (stage !== "interview" || paused) return undefined;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [stage, paused]);

  const searchQuestions = async () => {
    setSearching(true); setNotice(""); setResults([]); setSelected([]);
    try {
      const data = await api("/api/questions/search", jsonOptions({ company: form.company.trim() || null, role: form.role, interview_format: form.format, limit: 6 }));
      setResults(data.results || []); setNotice(data.notice || "");
    } catch (caught) { setNotice(caught.message); }
    finally { setSearching(false); }
  };
  const addCustom = () => {
    const value = customText.trim();
    if (custom.length >= 20) { setError("You can add up to 20 custom questions."); return; }
    if (value.length >= 4) { setCustom((items) => [...items, { id: crypto.randomUUID(), text: value }]); setCustomText(""); }
  };
  const begin = async () => {
    setBusy(true); setError("");
    try {
      const selectedPublic = results.flatMap((result) => (result.questions || []).filter((text) => selected.includes(result.id + ":" + text)).map((text, index) => ({ id: result.id + "-" + index, text, source: "reported", title: result.title, url: result.url, host: result.host })));
      const data = await api("/api/sessions", jsonOptions({ role: form.role, level: form.level, interview_format: form.format, source_mode: form.mode, company: form.company.trim() || null, question_count: Number(form.count), tone: form.tone, model: form.model, custom_questions: custom.map((item) => item.text), selected_public_questions: selectedPublic }));
      setSession(data); setElapsed(0); setStage("interview"); setVoiceOpen(window.innerWidth > 860);
    } catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  const acceptSession = (data) => { setSession(data); if (data.completed) { setStage("feedback"); setVoiceOpen(false); } };
  const submit = async () => {
    if (answer.trim().length < 2) { setError("Add an answer before continuing, or skip the question."); return; }
    setBusy(true); setError("");
    try { acceptSession(await api("/api/sessions/" + session.id + "/answer", jsonOptions({ answer }))); }
    catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  const skip = async () => {
    setBusy(true); setError("");
    try { acceptSession(await api("/api/sessions/" + session.id + "/skip", { method: "POST" })); }
    catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true); setError("");
    try { acceptSession(await api("/api/sessions/" + session.id + "/finish", { method: "POST" })); }
    catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  const startRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError("Recording is unavailable here. You can type your answer instead."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream); chunks.current = []; recorder.current = media;
      media.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const formData = new FormData();
        formData.append("file", new Blob(chunks.current, { type: media.mimeType || "audio/webm" }), "answer.webm");
        setTranscribing(true);
        try { const result = await api("/api/transcribe", { method: "POST", body: formData }); setAnswer((old) => [old.trim(), result.text].filter(Boolean).join(" ")); }
        catch (caught) { setError(caught.message + " You can type below."); }
        finally { setTranscribing(false); }
      };
      media.start(); setRecording(true);
    } catch { setError("Microphone access was denied. You can type your answer instead."); }
  };
  const stopRecording = () => { if (recorder.current?.state === "recording") recorder.current.stop(); setRecording(false); };
  const togglePause = () => {
    if (!paused) window.speechSynthesis?.pause?.();
    else window.speechSynthesis?.resume?.();
    setPaused((value) => !value);
  };
  const exportMarkdown = () => { if (session) window.location.href = "/api/sessions/" + session.id + "/export.md"; };
  const elapsedLabel = String(Math.floor(elapsed / 60)).padStart(2, "0") + ":" + String(elapsed % 60).padStart(2, "0");

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><Waveform className="brand-icon" size={20} weight="bold" />interview<span className="brand-light">booth</span></div>
      <div className="topbar-center"><span className="privacy-dot" /> Private practice space <span className="topbar-separator">/</span> {stage === "setup" ? "Session setup" : stage === "interview" ? "Live interview" : "Interview report"}</div>
      <button className="topbar-help" onClick={() => setVoiceOpen((open) => !open)}><Headphones size={17} /> Voice settings</button>
    </header>
    <div className={"workspace " + (voiceOpen ? "with-voice" : "")}>
      <aside className="left-rail"><div className="rail-kicker">YOUR WORKSPACE</div><div className={"rail-item " + (stage === "setup" ? "active" : "")}><Plus size={17} /> New practice</div><div className="rail-item muted"><Check size={17} /> Session notes</div><div className="rail-spacer" /><div className="privacy-card"><Check size={14} /><div><strong>Private by design</strong><p>Your answers stay in memory on this device.</p></div></div><div className="rail-bottom"><span className="avatar">IB</span><div><strong>Practice mode</strong><small>Local session</small></div></div></aside>
      <main className="main-content">
        {stage === "setup" && <section className="setup-view">
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> READY WHEN YOU ARE</div><h1>Make the next<br /><em>conversation</em> count.</h1><p>Build a practice session around the role you want. Speak, type, or mix the two.</p></div><div className="heading-note"><Sparkle size={18} /><span>Thoughtful practice.<br /><b>On your terms.</b></span></div></div>
          <div className="setup-card">
            <div className="setup-card-top"><div className="panel-title"><span className="panel-title-icon"><Briefcase size={17} /></span><span><small className="eyebrow">SESSION 01</small><b>Set up your interview</b></span></div><span className="step-indicator">01 <i>—</i> 02</span></div>
            <div className="form-grid">
              <label className="field"><span>Role you’re practicing for</span><input value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="e.g. Product designer" /></label>
              <label className="field"><span>Experience level</span><span className="select-wrap"><select value={form.level} onChange={(event) => update("level", event.target.value)}><option>Entry-level</option><option>Mid-level</option><option>Senior</option><option>Lead / Principal</option></select><CaretDown size={15} /></span></label>
              <label className="field"><span>Interview format</span><span className="select-wrap"><select value={form.format} onChange={(event) => update("format", event.target.value)}>{FORMATS.map((item) => <option key={item}>{item}</option>)}</select><CaretDown size={15} /></span></label>
              <label className="field"><span>Company <small>OPTIONAL</small></span><span className="input-with-icon"><Buildings size={16} /><input value={form.company} onChange={(event) => update("company", event.target.value)} placeholder="e.g. Stripe" /></span></label>
            </div>
            <div className="section-divider" />
            <div className="section-heading-row"><div><b className="field-label">Choose your question source</b><p>Pick how your interviewer builds the conversation.</p></div><span className={"ollama-pill " + (ollama.available ? "online" : "")}><i /> Ollama {ollama.available ? "ready" : "optional"}</span></div>
            <div className="mode-grid">{MODES.map(({ id, title, detail, icon: Icon }) => <button key={id} className={"mode-card " + (form.mode === id ? "selected" : "")} onClick={() => update("mode", id)}><span className="mode-radio">{form.mode === id && <i />}</span><Icon size={18} /><span className="mode-copy"><b>{title}</b><small>{detail}</small></span></button>)}</div>
            {form.mode !== "public" && <div className="model-row"><span className={"status-light " + (ollama.available ? "on" : "")} /><div className="model-status"><b>{ollama.available ? "Local model connected" : "Ollama is not running"}</b><small>{ollama.available ? "Answers stay on this device." : "Start Ollama for AI mode. Public questions still work."}</small></div><label className="compact-select"><small>MODEL</small><select value={form.model} onChange={(event) => update("model", event.target.value)}>{ollama.models.length ? ollama.models.map((model) => <option key={model}>{model}</option>) : <option>qwen2.5:3b</option>}</select><CaretDown size={14} /></label></div>}
            {form.mode !== "ollama" && <div className="search-area"><div className="search-heading"><div><b className="field-label">Reported questions <small>OPTIONAL</small></b><p>Public sources are linked. Answers are never searched.</p></div><button className="button-quiet" onClick={searchQuestions} disabled={searching || form.role.trim().length < 2}>{searching ? <><CircleNotch className="spin" size={15} /> Searching</> : <><Globe size={15} /> {results.length ? "Search again" : "Find questions"}</>}</button></div>
              {notice && <div className="search-notice">{notice}</div>}
              {results.length > 0 && <div className="source-list">{results.map((result) => <article className="source-card" key={result.id}><div className="source-head"><span><b>{result.title}</b><a href={result.url} target="_blank" rel="noreferrer">{result.host} <ArrowUpRight size={12} /></a></span><small>PUBLIC REPORT</small></div>{result.questions.length ? result.questions.map((text) => { const id = result.id + ":" + text; const active = selected.includes(id); return <label className={"question-option " + (active ? "chosen" : "")} key={id}><input type="checkbox" checked={active} onChange={() => setSelected((items) => active ? items.filter((item) => item !== id) : [...items, id])} /><span className="custom-check">{active && <Check size={12} />}</span><span>{text}</span></label>; }) : <p className="snippet-note">No exact question detected. Review the source and add a question in your own words.</p>}</article>)}</div>}
            </div>}
            <div className="custom-area"><div className="section-heading-row"><div><b className="field-label">Add your own questions <small>OPTIONAL</small></b><p>Every custom question is kept in your session.</p></div><label className="count-select"><small>QUESTIONS</small><select value={form.count} onChange={(event) => update("count", event.target.value)}>{[3, 4, 5, 6, 8, 10].map((number) => <option key={number}>{number}</option>)}</select><CaretDown size={13} /></label></div>
              <div className="add-question"><input value={customText} onChange={(event) => setCustomText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addCustom())} placeholder="Add a question you want to practice…" maxLength={600} /><button onClick={addCustom} disabled={customText.trim().length < 4}><Plus size={15} /> Add</button></div>
              {!!custom.length && <ul className="custom-list">{custom.map((item, index) => <li key={item.id}><small>{String(index + 1).padStart(2, "0")}</small><input aria-label={"Edit custom question " + (index + 1)} value={item.text} onChange={(event) => setCustom((items) => items.map((question) => question.id === item.id ? { ...question, text: event.target.value } : question))} /><div className="custom-actions"><button type="button" aria-label="Move question up" disabled={index === 0} onClick={() => setCustom((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}><CaretUp size={13} /></button><button type="button" aria-label="Move question down" disabled={index === custom.length - 1} onClick={() => setCustom((items) => { const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}><CaretDown size={13} /></button><button type="button" aria-label="Remove question" onClick={() => setCustom((items) => items.filter((question) => question.id !== item.id))}><Trash size={14} /></button></div></li>)}</ul>}
            </div>
            <div className="setup-footer"><p><span className="privacy-dot" /> Your practice is stored only while this tab is open.</p><button className="button-primary" onClick={begin} disabled={busy}>{busy ? <><CircleNotch size={16} className="spin" /> Preparing</> : <>Enter the booth <ArrowRight size={16} /></>}</button></div>
            {error && <div className="inline-error" role="alert">{error}</div>}
          </div>
          <div className="bottom-note"><span>01 / 03</span><span>Practice is a process. Take it one answer at a time.</span><span>LOCAL FIRST</span></div>
        </section>}

        {stage === "interview" && session && <section className="interview-view">
          <div className="interview-toolbar"><div className="session-actions"><button className="back-button" onClick={togglePause}>{paused ? "Resume" : "Pause"}</button><button className="back-button" onClick={finish}>End session</button></div><span className="session-meta"><i /> LIVE PRACTICE · {session.interview_format.toUpperCase()}</span><span className="session-timer">{elapsedLabel}</span></div>
          <div className="progress-row"><div className="progress-label"><span>YOUR PROGRESS</span><b>{String(Math.min(session.answered_count + 1, session.question_count)).padStart(2, "0")} / {String(session.question_count).padStart(2, "0")}</b></div><div className="progress-track"><span style={{ width: progress + "%" }} /></div></div>
          {paused ? <div className="paused-card"><span><Pause size={18} /></span><h2>Take your time.</h2><p>Your place and answer are kept for this session.</p><button className="button-primary" onClick={togglePause}><Play size={15} fill="currentColor" /> Resume practice</button></div> : question ? <><div className="question-stage"><div className="question-overline"><small>QUESTION {String(session.answered_count + 1).padStart(2, "0")}</small><span className={"source-chip " + question.source}>{question.source === "reported" ? "Publicly reported" : question.source === "ollama" ? "Local interviewer" : "Your question"}</span></div><h1>{question.text}</h1>{question.url && <a className="question-link" href={question.url} target="_blank" rel="noreferrer">Source: {question.host} <ArrowUpRight size={13} /></a>}<div className="asked-by"><span><SpeakerHigh size={16} /></span> INTERVIEWER · {session.tone}<button onClick={() => speak(question.text)}><Play size={14} /> Repeat question</button></div></div>
            <div className="answer-card"><div className="answer-card-head"><b>Your answer</b><small>Take a breath. There’s no rush.</small></div><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Start with the situation, then tell us what you did and what changed…" maxLength={12000} /><div className="answer-tools"><div className="answer-tools-left"><button className={"record-button " + (recording ? "recording" : "")} onClick={recording ? stopRecording : startRecording} disabled={transcribing}>{transcribing ? <><CircleNotch className="spin" size={15} /> Transcribing…</> : recording ? <><MicrophoneSlash size={15} /> Stop recording</> : <><Microphone size={15} /> Answer by voice</>}</button>{recording && <small className="recording-label">● RECORDING</small>}<small className="character-count">{answer.length.toLocaleString()} / 12,000</small></div><div className="answer-actions"><button className="button-text" onClick={skip} disabled={busy}>Skip</button><button className="button-primary" onClick={submit} disabled={busy || transcribing}>{busy ? <><CircleNotch className="spin" size={15} /> Thinking</> : <>Continue <ArrowRight size={15} /></>}</button></div></div>{error && <div className="inline-error" role="alert">{error}</div>}</div>
          </> : <div className="loading-stage"><CircleNotch className="spin" size={20} /> Loading question…</div>}
          <div className="interview-footnote"><span><Check size={14} /> Saved in memory for this session</span><button onClick={exportMarkdown}><DownloadSimple size={14} /> Download transcript</button></div>
        </section>}

        {stage === "feedback" && session && <section className="feedback-view"><button className="back-button" onClick={() => { setStage("setup"); setSession(null); }}>New practice</button><div className="report-title"><span><Check size={17} /></span><div><small>SESSION COMPLETE</small><h1>A good step forward.</h1><p>{session.role} · {session.interview_format} · {session.answered_count} answers</p></div></div><article className="feedback-card"><small className="eyebrow">YOUR DEBRIEF</small><h2>{session.feedback?.mode === "self_review" ? "Your reflection checklist" : "A few things to take with you"}</h2><p className="feedback-overall">{session.feedback?.overall}</p>{Object.keys(session.feedback?.scores || {}).length > 0 && <div className="score-grid">{Object.entries(session.feedback.scores).map(([name, score]) => <div className="score-card" key={name}><small>{name}</small><strong>{score}<i>/5</i></strong><div className="score-track"><span style={{ width: (score * 20) + "%" }} /></div></div>)}</div>}<div className="feedback-columns">{session.feedback?.strengths?.length > 0 && <div><h3>What came through</h3>{session.feedback.strengths.map((item) => <p key={item}>✓ {item}</p>)}</div>}<div><h3>For next time</h3>{(session.feedback?.next_steps || []).map((item) => <p key={item}>→ {item}</p>)}</div></div></article><div className="report-actions"><p>Your transcript stays in this tab and is removed when it closes.</p><button className="button-primary" onClick={exportMarkdown}><DownloadSimple size={16} /> Download session summary</button></div></section>}
      </main>

      {voiceOpen && <aside className="voice-panel"><div className="voice-panel-head"><div><small>THE DELIVERY</small><h2>Voice & tone</h2></div><button className="close-voice" aria-label="Close voice settings" onClick={() => setVoiceOpen(false)}><X size={17} /></button></div>
        <div className="voice-preview"><span><SpeakerHigh size={21} /></span><div><b>Interviewer voice</b><small>Browser speech · on device</small></div><button aria-label="Preview voice" onClick={() => speak("Hello. I will keep this " + form.tone + " and focused on your " + form.format + " interview.")}><Play size={14} weight="fill" /></button></div>
        <label className="voice-field"><small>VOICE</small><span className="select-wrap"><select value={voice} onChange={(event) => { const chosenVoice = voices.find((item) => item.voiceURI === event.target.value); setVoice(event.target.value); if (chosenVoice?.lang) setLanguage(chosenVoice.lang); }}>{voices.length ? <><option value="">System default</option>{voices.map((item) => <option key={item.voiceURI} value={item.voiceURI}>{item.name} · {item.lang}</option>)}</> : <option value="">System default</option>}</select><CaretDown size={14} /></span></label>
        <label className="voice-field"><small>LANGUAGE</small><span className="select-wrap"><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="es-ES">Spanish</option><option value="fr-FR">French</option></select><CaretDown size={14} /></span></label>
        <div className="voice-tuning"><div className="tuning-heading"><b>DELIVERY</b><span>Fine tune the voice</span></div>{[["Speed", rate, setRate], ["Pitch", pitch, setPitch], ["Volume", volume, setVolume]].map(([label, value, setter]) => <label className="range-field" key={label}><span>{label}<b>{Number(value).toFixed(1)}×</b></span><input type="range" min={label === "Volume" ? .2 : .7} max={label === "Volume" ? 1 : 1.3} step=".1" value={value} onChange={(event) => setter(Number(event.target.value))} /></label>)}</div>
        <div className="voice-tone"><div className="tuning-heading"><b>INTERVIEWER TONE</b><span>AI wording too</span></div><div className="tone-options">{["friendly", "neutral", "challenging"].map((tone) => <button className={form.tone === tone ? "selected" : ""} key={tone} onClick={() => update("tone", tone)}>{tone}{form.tone === tone && <Check size={12} />}</button>)}</div></div>
        <div className="voice-info"><SlidersHorizontal size={15} /><p>Voice settings use your browser’s built-in speech. Availability varies by device.</p></div><div className="voice-panel-bottom"><span><i className="privacy-dot" /> Voice settings are not uploaded</span><small>LOCAL AUDIO</small></div>
      </aside>}
    </div>
    <footer className="app-footer"><span>INTERVIEW BOOTH · BUILT FOR BETTER CONVERSATIONS</span><span>LOCAL AI, YOUR CHOICE</span></footer>
  </div>;
}
