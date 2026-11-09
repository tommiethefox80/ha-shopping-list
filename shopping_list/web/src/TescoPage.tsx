import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';

/** Tesco account: sign in the add-on's background browser, and watch sends. */
export function TescoPage({ state, act }: PageProps) {
  const [viewer, setViewer] = useState(false);
  const [frame, setFrame] = useState(0);
  const [text, setText] = useState('');
  const [secret, setSecret] = useState(true);
  const [busy, setBusy] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const { session, job } = state;

  // Refresh the screenshot while the viewer is open (and faster during a send).
  useEffect(() => {
    if (!viewer) return;
    const t = setInterval(() => setFrame((f) => f + 1), job.running ? 1000 : 800);
    return () => clearInterval(t);
  }, [viewer, job.running]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setFrame((f) => f + 1);
    }
  };

  const tap = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    void run(() => api.post('session/click', { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }));
  };

  return (
    <>
      <header className="page-head">
        <h1>Tesco</h1>
        <span className={`pill ${session.signedIn ? 'ok' : session.signedIn === false ? 'bad' : ''}`}>
          {session.signedIn ? 'Signed in' : session.signedIn === false ? 'Signed out' : 'Not checked'}
        </span>
      </header>

      <p className="muted small">
        The add-on keeps its own browser signed in to your Tesco account so it can fill the basket.
        Tesco signs it out every so often — sign in again here when Send says so. Book your slot in the Tesco app as usual.
      </p>

      <div className="row">
        <button className="secondary" disabled={busy} onClick={() => run(() => act(() => api.post('session/check')))}>Check sign-in</button>
        <button disabled={busy} onClick={() => run(async () => { setViewer(true); await api.post('session/open'); })}>Sign in to Tesco</button>
        {viewer && <button className="ghost" onClick={() => setViewer(false)}>Hide</button>}
      </div>

      {viewer && (
        <div className="viewer">
          <p className="muted small">Tap a box on the page to select it, type below, then use Tab / Enter. What you type goes straight to Tesco and is never saved.</p>
          <img ref={img} src={`api/session/screen.jpg?f=${frame}`} alt="Tesco sign-in page" onClick={tap} />
          <form className="row" onSubmit={(e) => { e.preventDefault(); const t = text; setText(''); void run(() => api.post('session/type', { text: t })); }}>
            <input type={secret ? 'password' : 'text'} autoComplete="off" placeholder="Text to type into the selected box" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="button" className="ghost" onClick={() => setSecret(!secret)}>{secret ? '👁' : '🙈'}</button>
            <button type="submit">Type</button>
          </form>
          <div className="row">
            {['Tab', 'Enter', 'Backspace'].map((k) => (
              <button key={k} className="secondary" onClick={() => run(() => api.post('session/key', { key: k }))}>{k}</button>
            ))}
            <button onClick={() => run(() => act(() => api.post('session/check')))}>I'm signed in</button>
          </div>
        </div>
      )}

      {job.log.length > 0 && (
        <section>
          <h3>Last send {job.running && `(${job.processed}/${job.total})`}</h3>
          <ul className="log">
            {job.log.map((l, i) => (
              <li key={i} className={l.level}>
                <span className="muted small">{new Date(l.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> {l.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
