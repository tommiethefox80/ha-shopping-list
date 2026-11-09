/** ticked = crossed off by hand (e.g. bought in store); in_basket = added to the Tesco basket by Send. */
export type ItemStatus = 'todo' | 'needs_product' | 'in_basket' | 'ticked' | 'unavailable' | 'error';

/** A Tesco product found by searching, offered when an item has no default product yet. */
export interface Candidate {
  tescoId: string;
  name: string;
  price?: string;
  clubcardPrice?: string;
  imageUrl?: string;
  available: boolean;
  /** Offer label from Tesco, e.g. "£5.50 Half Price Clubcard Price" or "2 for £20 Clubcard Price". */
  offer?: string;
}

/** A line on the shopping list. */
export interface Item {
  id: string;
  name: string;
  qty: number;
  ean?: string;
  /** Explicit product chosen for this item (overrides name matching). */
  productId?: string;
  /** One-off product picked without saving it as a default. */
  oneOffTescoId?: string;
  oneOffTescoName?: string;
  status: ItemStatus;
  message?: string;
  candidates?: Candidate[];
  source?: string;
  createdAt: string;
  updatedAt: string;
  addedAt?: string;
}

/** A default: "when we say X we mean this Tesco product". */
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
  /** Rule: use one of these instead of the main product when it's on offer (first match wins). */
  offerSwaps?: { tescoId: string; tescoName: string }[];
  /** Shown in the "Usuals" bar at the top of the list. */
  usual: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Db {
  items: Item[];
  products: Product[];
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
