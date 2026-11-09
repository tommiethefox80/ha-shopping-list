/** todo = still to get; ticked = got it (crossed off, shown under Done until cleared). */
export type ItemStatus = 'todo' | 'ticked';

/** A line on the shopping list. */
export interface Item {
  id: string;
  name: string;
  qty: number;
  ean?: string;
  /** The product this item is (set explicitly, by barcode, or matched by name). */
  productId?: string;
  status: ItemStatus;
  source?: string;
  createdAt: string;
  updatedAt: string;
  tickedAt?: string;
}

/** Something you buy: "when we say beans we mean Branston Baked Beans 410g". */
export interface Product {
  id: string;
  label: string;
  aliases: string[];
  /** Exactly which one: brand, size, variety ("Branston Baked Beans 410g"). */
  detail?: string;
  imageUrl?: string;
  eans: string[];
  defaultQty: number;
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
