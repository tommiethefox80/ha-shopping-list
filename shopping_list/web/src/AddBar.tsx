import { useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';

type Candidate = { key: string; name: string; aliases: string[]; detail?: string; count: number; lastAt: string; productId?: string; history: boolean };
type Ranked = Candidate & { score: number; matched: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const QTY = /^(\d{1,2})\s*[x×]?\s+/i;

/**
 * Add box with type-ahead: remembers everything you've added, completes what you're typing
 * (grey text — Enter or → accepts), and lists the best matches to tap.
 */
export function AddBar({ state, act, list, onScan }: PageProps & { onScan: () => void }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const candidates = useMemo<Candidate[]>(() => {
    const byProduct = new Map(state.products.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const h of state.history) {
      const p = h.productId ? byProduct.get(h.productId) : undefined;
      const name = p?.label ?? h.name;
      if (seen.has(norm(name))) continue;
      seen.add(norm(name));
      out.push({ key: h.key, name, aliases: p?.aliases ?? [], detail: p?.detail, count: h.count, lastAt: h.lastAt, productId: p?.id, history: true });
    }
    for (const p of state.products) {
      if (seen.has(norm(p.label))) continue;
      seen.add(norm(p.label));
      out.push({ key: `p:${p.id}`, name: p.label, aliases: p.aliases, detail: p.detail, count: 0, lastAt: '', productId: p.id, history: false });
    }
    return out;
  }, [state.history, state.products]);

  const onList = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of state.items) {
      if (i.listId !== list.id || i.status !== 'todo') continue;
      m.set(i.resolved.productId ? `p:${i.resolved.productId}` : norm(i.name), i.qty);
    }
    return m;
  }, [state.items, list.id]);
  const qtyOnList = (c: Candidate) => (c.productId ? onList.get(`p:${c.productId}`) : onList.get(norm(c.name)));

  const qtyMatch = text.match(QTY);
  const prefix = qtyMatch ? qtyMatch[0] : '';
  const q = norm(text.slice(prefix.length));

  const ranked = useMemo<Ranked[]>(() => {
    const now = Date.now();
    const recency = (iso: string) => (iso ? Math.max(0, 30 - (now - Date.parse(iso)) / 86_400_000) : 0);
    if (!q) {
      // Nothing typed yet: the things you add most that aren't already on the list.
      return candidates
        .filter((c) => c.count > 0 && qtyOnList(c) === undefined)
        .map((c) => ({ ...c, matched: c.name, score: c.count * 10 + recency(c.lastAt) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    }
    const out: Ranked[] = [];
    for (const c of candidates) {
      let tier = 0;
      let matched = c.name;
      for (const n of [c.name, ...c.aliases]) {
        const v = norm(n);
        const t = v.startsWith(q) ? 3 : v.split(' ').some((w) => w.startsWith(q)) ? 2 : q.length >= 3 && v.includes(q) ? 1 : 0;
        if (t > tier) {
          tier = t;
          matched = n;
        }
      }
      if (!tier) continue;
      out.push({ ...c, matched, score: tier * 1000 + Math.min(c.count, 50) * 10 + recency(c.lastAt) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 7);
  }, [candidates, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grey completion: the best match that starts with exactly what's been typed.
  const typed = text.slice(prefix.length);
  const best = q ? ranked.find((r) => norm(r.matched).startsWith(norm(typed)) && norm(r.matched) !== norm(typed)) : undefined;
  const ghost = best && typed && !/\s$/.test(text) ? best.matched.slice(typed.length) : '';

  const add = (value: string) => {
    const t = value.trim();
    if (!t) return;
    setText('');
    void act(() => api.post('items', { text: t, listId: list.id }));
    input.current?.focus();
  };
  const accept = () => setText(prefix + typed + ghost);

  return (
    <div className="add-wrap">
      <form className="add-bar" onSubmit={(e) => { e.preventDefault(); add(ghost ? prefix + typed + ghost : text); }}>
        <div className="typeahead">
          <div className="ghost" aria-hidden>
            <span className="ghost-typed">{text}</span>
            {ghost && <span className="ghost-rest">{ghost}</span>}
          </div>
          <input
            ref={input}
            placeholder="Add item… e.g. 2 beans"
            value={text}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              const atEnd = e.currentTarget.selectionStart === text.length;
              if (ghost && atEnd && (e.key === 'ArrowRight' || e.key === 'Tab')) {
                e.preventDefault();
                accept();
              } else if (e.key === 'Escape') {
                setText('');
              }
            }}
          />
        </div>
        <button type="submit" aria-label="Add">+</button>
        <button type="button" className="scan-btn" aria-label="Scan barcode" onClick={onScan}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            <path d="M7 8v8M10 8v8M13 8v8M16 8v8" />
          </svg>
        </button>
      </form>
      {focused && ranked.length > 0 && (
        <ul className="suggest-list" onMouseDown={(e) => e.preventDefault()}>
          {!q && <li className="suggest-head muted small">You often add</li>}
          {ranked.map((r) => {
            const already = qtyOnList(r);
            return (
              <li key={r.key}>
                <button className="suggest-pick" onClick={() => add(prefix + r.name)}>
                  <span className="grow">
                    <span className="s-name">{prefix}{r.name}</span>
                    {r.matched !== r.name && <span className="muted small"> ({r.matched})</span>}
                    {r.detail && r.detail.toLowerCase() !== r.name.toLowerCase() && <span className="s-detail muted small">{r.detail}</span>}
                  </span>
                  {already !== undefined && <span className="pill ok">on list{already > 1 ? ` ×${already}` : ''}</span>}
                  {r.count > 1 && <span className="muted small s-count">{r.count}×</span>}
                </button>
                {r.history && (
                  <button
                    className="suggest-forget"
                    aria-label={`Stop suggesting ${r.name}`}
                    title="Stop suggesting this"
                    onClick={() => act(() => api.del(`history/${encodeURIComponent(r.key)}`))}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
          {q && ghost && <li className="suggest-hint muted small">Enter adds “{prefix}{typed}{ghost}” · keep typing for something new</li>}
        </ul>
      )}
    </div>
  );
}
