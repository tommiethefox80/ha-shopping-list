/** todo = still to get; ticked = got it (shown under Done / "in trolley" until cleared). */
export type ItemStatus = 'todo' | 'ticked';

/** A named list, e.g. "Tesco", "Aldi", "B&Q". Each has its own aisle order. */
export interface ShopList {
  id: string;
  name: string;
  /** Category ids in the order you walk the shop. Missing categories go at the end. */
  aisleOrder: string[];
  createdAt: string;
}

/** An aisle / section of the shop. */
export interface Category {
  id: string;
  name: string;
  emoji: string;
}

/** A line on a shopping list. */
export interface Item {
  id: string;
  listId: string;
  name: string;
  qty: number;
  ean?: string;
  /** The product this item is (set explicitly, by barcode, or matched by name). */
  productId?: string;
  /** Overrides the product's / learned category for this item. */
  categoryId?: string;
  /** Note for this shop only ("ripe ones", "if no Branston get Heinz"). */
  note?: string;
  status: ItemStatus;
  source?: string;
  addedBy?: string;
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
  /** Uploaded photo id (served from /api/photos/<id>.jpg). */
  photo?: string;
  categoryId?: string;
  /** Usual price per unit, in pence. */
  price?: number;
  eans: string[];
  defaultQty: number;
  /** Shown in the "Usuals" bar at the top of the list. */
  usual: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What we've learned about a free-text name that isn't a product (category, price). */
export interface Memory {
  categoryId?: string;
  price?: number;
}

/** One "bought it" event: an item ticked off. Drives suggestions. */
export interface Purchase {
  key: string;
  name: string;
  productId?: string;
  qty: number;
  at: string;
}

/** Everything ever added, for type-ahead: key -> how often and when. */
export interface HistoryEntry {
  name: string;
  productId?: string;
  count: number;
  lastAt: string;
}

export interface Activity {
  at: string;
  who?: string;
  text: string;
  listId?: string;
}

/** A recipe: imported from a web page or typed in. */
export interface Recipe {
  id: string;
  name: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  /** Uploaded photo id (takes precedence over imageUrl). */
  photo?: string;
  /** Servings the ingredient amounts are written for. */
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  tags: string[];
  /** One per line. A line ending in ":" is a section heading ("For the sauce:"). */
  ingredients: string[];
  steps: string[];
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

/** The evening meal for one day: a recipe, or just words ("Leftovers", "Takeaway"). */
export interface Meal {
  recipeId?: string;
  text?: string;
  /** How many it's for (defaults to the recipe's servings). */
  servings?: number;
}

/** A loyalty card (Clubcard etc.) shown as a barcode at the till. */
export interface LoyaltyCard {
  id: string;
  name: string;
  number: string;
  format: 'EAN13' | 'CODE128' | 'QR';
  createdAt: string;
}

/** What we last agreed with one Home Assistant to-do list: HA item uid -> our item. */
export interface HaLink {
  itemId: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

export interface Db {
  version: 3;
  lists: ShopList[];
  categories: Category[];
  items: Item[];
  products: Product[];
  memory: Record<string, Memory>;
  purchases: Purchase[];
  activity: Activity[];
  /** Per HA to-do entity: links between its items and ours. */
  haSync: Record<string, { links: Record<string, HaLink> }>;
  recipes: Recipe[];
  /** Evening meals: "2026-11-16" -> meal. */
  meals: Record<string, Meal>;
  cards: LoyaltyCard[];
  history: Record<string, HistoryEntry>;
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
