import type { Item } from './domain.js';
import { now } from './domain.js';
import { findProduct } from './matching.js';
import type { Store } from './store.js';
import { SessionExpiredError, type TescoClient } from './tesco/driver.js';

export type Outcome = 'completed' | 'signed_out' | 'failed' | 'cancelled';

export interface JobLog {
  at: string;
  level: 'info' | 'ok' | 'warn' | 'error';
  text: string;
}

export interface JobState {
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  outcome?: Outcome;
  total: number;
  processed: number;
  added: number;
  needsProduct: number;
  failed: number;
  current?: string;
  log: JobLog[];
}

const SENDABLE: Item['status'][] = ['todo', 'error', 'unavailable', 'needs_product'];

/** "Send to Tesco": adds each list item to the basket and ticks it off as it goes. */
export class Sender {
  state: JobState = { running: false, total: 0, processed: 0, added: 0, needsProduct: 0, failed: 0, log: [] };
  private cancelRequested = false;

  constructor(
    private readonly store: Store,
    private readonly tesco: TescoClient,
    private readonly delay: { min: number; max: number },
    private readonly onSignedIn: (signedIn: boolean) => void = () => {},
  ) {}

  start(itemIds?: string[]): JobState {
    if (this.state.running) throw new Error('A send is already running');
    const ids = this.store.data.items
      .filter((i) => SENDABLE.includes(i.status) && (!itemIds || itemIds.includes(i.id)))
      .map((i) => i.id);
    this.cancelRequested = false;
    this.state = {
      running: true, startedAt: now(), total: ids.length, processed: 0, added: 0, needsProduct: 0, failed: 0, log: [],
    };
    void this.run(ids);
    return this.state;
  }

  cancel() {
    if (this.state.running) this.cancelRequested = true;
  }

  private log(level: JobLog['level'], text: string) {
    this.state.log.push({ at: now(), level, text });
  }

  private patch(id: string, changes: Partial<Item>) {
    this.store.update((db) => {
      const item = db.items.find((i) => i.id === id);
      if (item) Object.assign(item, changes, { updatedAt: now() });
    });
  }

  private finish(outcome: Outcome) {
    Object.assign(this.state, { running: false, outcome, finishedAt: now(), current: undefined });
  }

  private async run(ids: string[]) {
    try {
      if (ids.length === 0) {
        this.log('info', 'Nothing to send');
        return this.finish('completed');
      }
      this.log('info', 'Checking you are signed in to Tesco…');
      const signedIn = await this.tesco.isSignedIn();
      this.onSignedIn(signedIn);
      if (!signedIn) {
        this.log('error', 'Signed out of Tesco — sign in from the Tesco account page, then send again');
        return this.finish('signed_out');
      }

      for (const [index, id] of ids.entries()) {
        if (this.cancelRequested) {
          this.log('warn', 'Stopped');
          return this.finish('cancelled');
        }
        const item = this.store.data.items.find((i) => i.id === id);
        if (!item || !SENDABLE.includes(item.status)) continue;
        this.state.current = item.name;

        const product = findProduct(this.store.data.products, item);
        const tescoId = item.oneOffTescoId ?? product?.tescoId;

        if (!tescoId) {
          const query = item.name.startsWith('Barcode ') && item.ean ? item.ean : item.name;
          const candidates = await this.tesco.search(query).catch(() => []);
          this.patch(id, {
            status: 'needs_product',
            candidates,
            message: candidates.length ? 'Pick which product you mean' : 'No Tesco results — search for it on the item',
          });
          this.state.needsProduct++;
          this.log('warn', `${item.name}: no default product yet — pick one`);
        } else {
          try {
            const res = await this.tesco.addToBasket(tescoId, item.qty);
            if (res.ok) {
              this.patch(id, {
                status: 'in_basket', addedAt: now(), candidates: undefined,
                message: res.productName ? `${item.qty} × ${res.productName}` : undefined,
              });
              if (item.ean && product && !product.eans.includes(item.ean)) {
                // Learn the barcode so the next scan matches straight away.
                this.store.update(() => product.eans.push(item.ean!));
              }
              this.state.added++;
              this.log('ok', `${item.name} → ${res.productName ?? tescoId} × ${item.qty}`);
            } else {
              this.patch(id, { status: res.reason === 'unavailable' ? 'unavailable' : 'error', message: res.message });
              this.state.failed++;
              this.log(res.reason === 'unavailable' ? 'warn' : 'error', `${item.name}: ${res.message}`);
            }
          } catch (e) {
            if (e instanceof SessionExpiredError) {
              this.onSignedIn(false);
              this.log('error', 'Tesco signed you out part way through — sign in and send again (added items stay ticked)');
              return this.finish('signed_out');
            }
            const message = e instanceof Error ? e.message.split('\n')[0] : String(e);
            this.patch(id, { status: 'error', message });
            this.state.failed++;
            this.log('error', `${item.name}: ${message}`);
          }
        }
        this.state.processed++;
        if (index < ids.length - 1) await sleep(this.delay.min + Math.random() * (this.delay.max - this.delay.min));
      }
      this.log('info', `Done: ${this.state.added} added, ${this.state.needsProduct} need a product, ${this.state.failed} problems`);
      this.finish('completed');
    } catch (e) {
      this.log('error', e instanceof Error ? e.message.split('\n')[0] : String(e));
      this.finish('failed');
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
