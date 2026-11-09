import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';

/** Tesco account: sign in the add-on's background browser, and watch sends. */
export function TescoPage({ state, act }: PageProps) {
  const [viewer, setViewer] = useState(false);
  const [frame, setFrame] = useState(0);
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState<string>();
  const [viewerMsg, setViewerMsg] = useState<string>();
  const lastUrl = useRef<string | undefined>(undefined);
  const { session, job } = state;

  // Refresh the screenshot while the viewer is open (and faster during a send).
  useEffect(() => {
    if (!viewer) return;
    const t = setInterval(() => setFrame((f) => f + 1), job.running ? 1000 : 800);
    return () => clearInterval(t);
  }, [viewer, job.running]);

  // Fetch each frame ourselves so a failure shows a message, not a broken image.
  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    fetch(`api/session/screen.jpg?f=${frame}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setViewerMsg((body as { error?: string }).error ?? `Couldn't get a picture (HTTP ${r.status})`);
          return;
        }
        setStale(r.headers.get('X-Frame-Stale') === '1');
        const url = URL.createObjectURL(await r.blob());
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
        setSrc(url);
        setViewerMsg(undefined);
      })
      .catch((e: Error) => !cancelled && setViewerMsg(e.message));
    return () => {
      cancelled = true;
    };
  }, [viewer, frame]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setViewerMsg((e as Error).message);
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
          <p className="muted small">Enter your Tesco email and tap Next, then your password and tap Sign in. They go straight into Tesco's page and are never saved. You can also tap the picture to press buttons on it.</p>
          {viewerMsg && <p className="notice warn">{viewerMsg}</p>}
          {src ? (
            <img src={src} alt="The add-on's browser" onClick={tap} />
          ) : (
            <p className="muted center">Starting the browser and opening Tesco… this can take 20–30 seconds the first time.</p>
          )}
          {stale && <p className="muted small">⚠ The picture may be a few seconds behind while Tesco loads.</p>}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const t = email;
              void run(() => api.post('session/fill', { field: 'email', text: t }));
            }}
          >
            <input type="email" autoComplete="username" placeholder="Tesco email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" disabled={!email}>Next</button>
          </form>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const t = password;
              setPassword('');
              void run(() => api.post('session/fill', { field: 'password', text: t }));
            }}
          >
            <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit" disabled={!password}>Sign in</button>
          </form>
          <details className="other-input">
            <summary className="muted small">Something else (a code, a captcha, another box)?</summary>
            <form className="row" onSubmit={(e) => { e.preventDefault(); const t = text; setText(''); void run(() => api.post('session/type', { text: t })); }}>
              <input autoComplete="off" placeholder="Tap the box on the picture, then type here" value={text} onChange={(e) => setText(e.target.value)} />
              <button type="submit">Type</button>
            </form>
          <div className="row">
            {['Tab', 'Enter', 'Backspace'].map((k) => (
              <button key={k} className="secondary" onClick={() => run(() => api.post('session/key', { key: k }))}>{k}</button>
            ))}
          </div>
          </details>
          <button className="secondary" onClick={() => run(() => act(() => api.post('session/check')))}>I'm signed in — check</button>
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
