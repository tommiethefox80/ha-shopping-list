import { useEffect, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { PlanEntry } from './types';

/** Shown when Send is pressed and some items have an "if on offer" rule: confirm or change each pick. */
export function SendReview({ act, onClose }: { act: PageProps['act']; onClose: () => void }) {
  const [plan, setPlan] = useState<PlanEntry[]>();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .post<PlanEntry[]>('send/plan')
      .then((p) => {
        setPlan(p);
        setChoices(Object.fromEntries(p.map((e) => [e.itemId, e.chosen])));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const send = () => act(() => api.post('send', { choices })).then(onClose);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Before sending</h2>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
        {error && <p className="notice warn">{error}</p>}
        {!plan && !error && <p className="muted">Checking this week's offers on Tesco…</p>}
        {plan?.map((e) => (
          <section key={e.itemId} className="review">
            <h3>
              {e.itemName} {e.qty > 1 && <span className="muted">×{e.qty}</span>}
            </h3>
            <p className="muted small">{e.reason}</p>
            {e.options.map((o) => (
              <label key={o.tescoId} className={`option ${choices[e.itemId] === o.tescoId ? 'on' : ''}`}>
                <input
                  type="radio"
                  name={e.itemId}
                  checked={choices[e.itemId] === o.tescoId}
                  onChange={() => setChoices({ ...choices, [e.itemId]: o.tescoId })}
                />
                <span className="grow">
                  {o.name}
                  {o.isMain && <span className="muted small"> (usual)</span>}
                  <span className="small">
                    {' '}
                    {o.offer ? <span className="offer">{o.offer}</span> : o.price && <span className="muted">{o.price}</span>}
                    {!o.available && <span className="pill warn">Unavailable</span>}
                  </span>
                </span>
              </label>
            ))}
          </section>
        ))}
        {plan && (
          <button className="wide gap-top" onClick={send}>
            🛒 Send to Tesco basket
          </button>
        )}
        {error && (
          <button className="secondary wide gap-top" onClick={() => act(() => api.post('send')).then(onClose)}>
            Send anyway (rules decide)
          </button>
        )}
      </div>
    </div>
  );
}
