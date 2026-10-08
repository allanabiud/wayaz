import { api } from "@/lib/api";
import type { Category, Paginated, ProductImage } from "@/lib/types";

/** Product as returned by the public catalog list serializer. */
export interface StoreProduct {
  id: number;
  title: string;
  slug: string;
  category?: string;
  category_slug?: string;
  base_price: string;
  sale_price: string | null;
  current_price: string;
  is_on_sale: boolean;
  is_in_stock: boolean;
  is_featured: boolean;
  sizes: string[];
  primary_image: string | null;
  created_at: string;
}

export interface StorefrontCatalog {
  categories: Category[];
  products: StoreProduct[];
}

/** Full product as returned by the public detail endpoint. */
export interface StoreProductDetail {
  id: number;
  title: string;
  slug: string;
  category: Category | null;
  description: string;
  base_price: string;
  sale_price: string | null;
  current_price: string;
  is_on_sale: boolean;
  is_in_stock: boolean;
  stock_quantity: number;
  sizes: string[];
  images: ProductImage[];
  // Rating summary; user_rating is null for anonymous/SSR requests until
  // refreshed client-side when signed in.
  average_rating: number | null;
  rating_count: number;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
}

/** Product summary embedded in each cart line. */
export interface CartProduct {
  id: number;
  product_title: string;
  product_slug: string;
  unit_price: string;
  stock_quantity: number;
  is_in_stock: boolean;
  thumbnail: string | null;
}

export interface CartLine {
  id: number;
  product: CartProduct;
  /** Selected size ("" when the product is one-size). */
  size: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  added_at: string;
}

export interface Cart {
  id: string;
  total_items: number;
  subtotal: string;
  items: CartLine[];
}

// ---- Account order history ---------------------------------------------

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export interface StoreOrderItem {
  id: number;
  product_title: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

/** One entry of GET /api/v1/orders/ (OrderSerializer + display labels). */
export interface StoreOrder {
  id: number;
  order_number: string;
  status: OrderStatus;
  status_display: string;
  payment_method: "cod" | "mpesa";
  payment_method_display: string;
  payment_status: string;
  shipping_name: string;
  county: string;
  town: string;
  street_address: string;
  delivery_method: string;
  delivery_method_display: string;
  subtotal: string;
  discount_amount: string;
  shipping_fee: string;
  total_amount: string;
  item_count: number;
  items: StoreOrderItem[];
  whatsapp_link: string;
  created_at: string;
}

/** Signed-in shopper's order history, newest first (server-paginated). */
export function fetchOrders(
  page = 1,
  pageSize = 10,
): Promise<Paginated<StoreOrder>> {
  return api.get(`/api/v1/orders/?page=${page}&page_size=${pageSize}`);
}

// ---- Product ratings ---------------------------------------------------

/** Aggregate rating for a product plus the caller's own rating (null if none). */
export interface ProductRatingSummary {
  average_rating: number | null;
  rating_count: number;
  user_rating: number | null;
}

/** Read the rating summary; `user_rating` requires an authenticated caller. */
export function fetchProductRating(slug: string): Promise<ProductRatingSummary> {
  return api.get(`/api/v1/catalog/products/${encodeURIComponent(slug)}/review/`);
}

/** Submit (or replace) the caller's 1-5 star rating for a product. */
export function submitProductRating(
  slug: string,
  rating: number,
): Promise<ProductRatingSummary> {
  return api.post(`/api/v1/catalog/products/${encodeURIComponent(slug)}/review/`, {
    rating,
  });
}

/** Ksh formatting shared by the storefront (whole shillings). */
export function formatKsh(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

// ---- WhatsApp helpers -------------------------------------------------

export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "254700000000";

export function waLink(text: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function productWhatsappLink(product: {
  title: string;
  current_price: string;
}): string {
  return waLink(
    `Hi Wayaz! I'm interested in "${product.title}" - Ksh ${formatKsh(product.current_price)}. Is it available?`,
  );
}

export function cartWhatsappLink(cart: Cart): string {
  const lines = cart.items.map(
    (line) =>
      `• ${line.quantity}× ${line.product.product_title}${line.size ? ` (${line.size})` : ""} - Ksh ${formatKsh(line.line_total)}`,
  );
  return waLink(
    [
      "Hi Wayaz! I'd like to order:",
      ...lines,
      `Subtotal: Ksh ${formatKsh(cart.subtotal)}`,
    ].join("\n"),
  );
}

// ---- Guest cart (server-side, identified by an X-Cart-ID header) ------

const CART_KEY = "wayaz.cart";

export function storedCartId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CART_KEY);
}

function rememberCart(cart: Cart): Cart {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CART_KEY, cart.id);
  }
  return cart;
}

function cartHeaders(): Record<string, string> {
  const id = storedCartId();
  return id ? { "X-Cart-ID": id } : {};
}

export function fetchCart(): Promise<Cart> {
  return api
    .get<Cart>("/api/v1/orders/cart/", { headers: cartHeaders() })
    .then(rememberCart);
}

export function addToCart(
  product_id: number,
  quantity = 1,
  size = "",
): Promise<Cart> {
  return api
    .post<Cart>(
      "/api/v1/orders/cart/items/",
      { product_id, quantity, size },
      { headers: cartHeaders() },
    )
    .then(rememberCart);
}

export function updateCartItem(item_id: number, quantity: number): Promise<Cart> {
  return api
    .patch<Cart>(
      `/api/v1/orders/cart/items/${item_id}/`,
      { quantity },
      { headers: cartHeaders() },
    )
    .then(rememberCart);
}

export function removeCartItem(item_id: number): Promise<Cart> {
  return api
    .delete<Cart>(`/api/v1/orders/cart/items/${item_id}/`, {
      headers: cartHeaders(),
    })
    .then(rememberCart);
}

// ---- Favourites (device-local) ----------------------------------------

const WISHLIST_KEY = "wayaz.wishlist";

/** Saved favourite ids; loaded async so SSR markup never mismatches. */
export function storedWishlist(): Promise<number[]> {
  return Promise.resolve().then(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(WISHLIST_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id): id is number => Number.isInteger(id));
    } catch {
      return [];
    }
  });
}

export function rememberWishlist(ids: number[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
}

// ---- Search history ---------------------------------------------------

const SEARCH_KEY = "wayaz.searchHistory";
const SEARCH_LIMIT = 8;

function readSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (term): term is string => typeof term === "string" && term.trim() !== "",
      )
      .slice(0, SEARCH_LIMIT);
  } catch {
    return [];
  }
}

function writeSearchHistory(terms: string[]): string[] {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SEARCH_KEY, JSON.stringify(terms));
    } catch {
      // Storage unavailable (private mode) - history simply won't persist.
    }
  }
  return terms;
}

/** Recent search terms on this device; async so SSR markup never mismatches. */
export function storedSearchHistory(): Promise<string[]> {
  return Promise.resolve().then(readSearchHistory);
}

/** Puts a term first (deduped, capped) and returns the saved list. */
export function rememberSearch(term: string): string[] {
  const clean = term.trim();
  if (!clean) return readSearchHistory();
  const rest = readSearchHistory().filter(
    (saved) => saved.toLowerCase() !== clean.toLowerCase(),
  );
  return writeSearchHistory([clean, ...rest].slice(0, SEARCH_LIMIT));
}

/** Drops one term from the history and returns the saved list. */
export function forgetSearch(term: string): string[] {
  return writeSearchHistory(
    readSearchHistory().filter((saved) => saved !== term),
  );
}

/** Wipes the whole search history. */
export function clearSearchHistory(): string[] {
  return writeSearchHistory([]);
}

// Words too generic to be useful as suggested searches.
const HOT_STOPWORDS = new Set([
  "been",
  "have",
  "just",
  "that",
  "them",
  "then",
  "than",
  "they",
  "this",
  "very",
  "will",
  "with",
  "from",
  "your",
]);

/**
 * Hot searches: categories with items first, then the most frequent words
 * across product titles.
 */
export function hotSearches(catalog: StorefrontCatalog): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string) => {
    const clean = term.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    const matches = catalog.products.some(
      (product) =>
        product.title.toLowerCase().includes(key) ||
        (product.category ?? "").toLowerCase().includes(key),
    );
    if (!matches) return;
    seen.add(key);
    terms.push(clean);
  };

  catalog.categories
    .filter((category) => category.product_count > 0)
    .slice(0, 3)
    .forEach((category) => add(category.name));

  const words = new Map<string, { count: number; display: string }>();
  for (const product of catalog.products) {
    for (const word of product.title.split(/[^A-Za-z]+/)) {
      if (word.length < 4) continue;
      const key = word.toLowerCase();
      if (HOT_STOPWORDS.has(key)) continue;
      const entry = words.get(key);
      if (entry) entry.count += 1;
      else words.set(key, { count: 1, display: word });
    }
  }

  [...words.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .forEach(([, { display }]) => {
      if (terms.length < 6) add(display);
    });

  return terms;
}

// ---- Catalog ----------------------------------------------------------

/** Loads every category plus all product pages (up to 1,000 products). */
export async function fetchStorefrontCatalog(): Promise<StorefrontCatalog> {
  const categories = await api.get<Paginated<Category>>(
    "/api/v1/catalog/categories/?page_size=100",
  );

  const products: StoreProduct[] = [];
  let path: string | null = "/api/v1/catalog/products/?page_size=100";
  for (let guard = 0; path !== null && guard < 10; guard += 1) {
    const page: Paginated<StoreProduct> = await api.get<Paginated<StoreProduct>>(path);
    products.push(...page.results);
    if (page.next) {
      const nextUrl = new URL(page.next);
      path = `${nextUrl.pathname}${nextUrl.search}`;
    } else {
      path = null;
    }
  }

  return { categories: categories.results, products };
}
