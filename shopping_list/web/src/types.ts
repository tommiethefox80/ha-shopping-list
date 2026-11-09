export type ItemStatus = 'todo' | 'ticked';

export interface Item {
  id: string;
  name: string;
  qty: number;
  ean?: string;
  productId?: string;
  status: ItemStatus;
  createdAt: string;
  resolved: { productId?: string; detail?: string; imageUrl?: string };
}

export interface Product {
  id: string;
  label: string;
  aliases: string[];
  detail?: string;
  imageUrl?: string;
  eans: string[];
  defaultQty: number;
  usual: boolean;
}

export interface AppState {
  items: Item[];
  products: Product[];
}
