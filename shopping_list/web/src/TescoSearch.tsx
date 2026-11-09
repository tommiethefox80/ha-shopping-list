import { useState } from 'react';
import { api } from './api';
import type { Candidate } from './types';

/** Search Tesco (through the add-on's background browser) or paste a product link. */
export function TescoSearch({ initial, onPick }: { initial?: string; onPick: (c: Candidate) => void }) {
  const [q, setQ] = useState(initial ?? '');
  const [results, setResults] = useState<Candidate[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    const id = term.match(/\/products\/(\d{6,12})/)?.[1] ?? term.match(/^(\d{6,12})$/)?.[1];
    if (id) return onPick({ tescoId: id, name: '', available: true });
    setBusy(true);
    setError(undefined);
    try {
      setResults(await api.get<Candidate[]>(`tesco/search?q=${encodeURIComponent(term)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tesco-search">
      <form className="row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input placeholder="Search Tesco or paste a product link" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? '…' : 'Search'}</button>
      </form>
      {busy && <p className="muted">Searching Tesco… (takes a few seconds)</p>}
      {error && <p className="notice warn">{error}</p>}
      {results && results.length === 0 && <p className="muted">No results.</p>}
      {results && <CandidateList candidates={results} onPick={onPick} />}
    </div>
  );
}

export function CandidateList({ candidates, onPick }: { candidates: Candidate[]; onPick: (c: Candidate) => void }) {
  return (
    <ul className="candidates">
      {candidates.map((c) => (
        <li key={c.tescoId}>
          {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" /> : <div className="img-ph" />}
          <div className="grow">
            <div>{c.name}</div>
            <div className="muted small">
              {c.price}
              {c.clubcardPrice && <span className="clubcard"> {c.clubcardPrice} Clubcard</span>}
              {!c.available && <span className="pill warn">Unavailable</span>}
            </div>
          </div>
          <button onClick={() => onPick(c)}>Use</button>
        </li>
      ))}
    </ul>
  );
}
