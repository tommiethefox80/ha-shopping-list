export type ItemStatus = 'todo' | 'ticked';

export interface ShopList {
  id: string;
  name: string;
  aisleOrder: string[];
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
}

export interface Item {
  id: string;
  listId: string;
  name: string;
  qty: number;
  ean?: string;
  productId?: string;
  note?: string;
  status: ItemStatus;
  addedBy?: string;
  createdAt: string;
  tickedAt?: string;
  resolved: { productId?: string; detail?: string; imageUrl?: string; photo?: string; categoryId: string; price?: number };
}

export interface Product {
  id: string;
  label: string;
  aliases: string[];
  detail?: string;
  imageUrl?: string;
  photo?: string;
  categoryId?: string;
  price?: number;
  eans: string[];
  defaultQty: number;
  usual: boolean;
}

export interface Suggestion {
  key: string;
  name: string;
  productId?: string;
  everyDays: number;
  daysSince: number;
  qty: number;
}

export interface Activity {
  at: string;
  who?: string;
  text: string;
  listId?: string;
}

export interface Recipe {
  id: string;
  name: string;
  url?: string;
  imageUrl?: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  parsed: { name: string; staple: boolean }[];
}

export interface LoyaltyCard {
  id: string;
  name: string;
  number: string;
  format: 'EAN13' | 'CODE128' | 'QR';
}

export interface AppState {
  version: number;
  me?: string;
  lists: ShopList[];
  categories: Category[];
  items: Item[];
  products: Product[];
  suggestions: Suggestion[];
  frequent: string[];
  memoryNames: string[];
  activity: Activity[];
  ha: { connected: boolean; entities: string[]; error?: string } | null;
  recipes: Recipe[];
  plan: Record<string, string[]>;
  cards: LoyaltyCard[];
}
