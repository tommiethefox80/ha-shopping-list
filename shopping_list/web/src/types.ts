export type ItemStatus = 'todo' | 'needs_product' | 'in_basket' | 'ticked' | 'unavailable' | 'error';

export interface Candidate {
  tescoId: string;
  name: string;
  price?: string;
  clubcardPrice?: string;
  imageUrl?: string;
  available: boolean;
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  ean?: string;
  productId?: string;
  oneOffTescoId?: string;
  status: ItemStatus;
  message?: string;
  candidates?: Candidate[];
  createdAt: string;
  resolved: { tescoId?: string; tescoName?: string; productId?: string };
}

export interface Product {
  id: string;
  label: string;
  aliases: string[];
  tescoId: string;
  tescoName: string;
  price?: string;
  imageUrl?: string;
  eans: string[];
  defaultQty: number;
  usual: boolean;
}

export interface JobState {
  running: boolean;
  outcome?: 'completed' | 'signed_out' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  added: number;
  needsProduct: number;
  failed: number;
  current?: string;
  log: { at: string; level: 'info' | 'ok' | 'warn' | 'error'; text: string }[];
}

export interface Session {
  signedIn: boolean | null;
  checkedAt?: string;
}

export interface AppState {
  items: Item[];
  products: Product[];
  job: JobState;
  session: Session;
}
