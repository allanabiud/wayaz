import { api } from "@/lib/api";
import type { Address, Category, Paginated, ProductImage } from "@/lib/types";

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
  | "PROCESSING"
  | "CONFIRMED"
  | "DELIVERED"
  | "CANCELLED";

export interface StoreOrderItem {
  id: number;
  /** Live catalog slug for buy-again links; null once the product is removed. */
  product_slug: string | null;
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
  /** Code of the coupon that produced discount_amount, if any. */
  coupon_code: string | null;
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

/** A single written review shown on the product page. */
export interface ProductReview {
  id: number;
  rating: number;
  comment: string;
  /** Display name of whoever left it. */
  reviewer: string;
  /** True when it belongs to the signed-in viewer (lets the PDP re-open it). */
  mine: boolean;
  created_at: string;
}

/** Approved reviews for a product, newest first, 10 per page. */
export function fetchProductReviews(
  slug: string,
  page = 1,
  pageSize = 10,
): Promise<Paginated<ProductReview>> {
  return api.get(
    `/api/v1/catalog/products/${encodeURIComponent(slug)}/reviews/?page=${page}&page_size=${pageSize}`,
  );
}

/**
 * Submit (or replace) the caller's review of a product. Omitting `comment`
 * leaves any written feedback intact - that is what the quick star row on
 * the product page sends; the review form always passes it explicitly.
 */
export function submitProductRating(
  slug: string,
  rating: number,
  comment?: string,
): Promise<ProductRatingSummary> {
  const body: { rating: number; comment?: string } = { rating };
  if (comment !== undefined) body.comment = comment;
  return api.post(`/api/v1/catalog/products/${encodeURIComponent(slug)}/review/`, body);
}

/** Ksh formatting shared by the storefront (whole shillings). */
export function formatKsh(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

// ---- WhatsApp helpers -------------------------------------------------

export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "254700000000";

export function waLink(text: string, customNumber?: string): string {
  const number = (customNumber || WHATSAPP_NUMBER).replace(/[^0-9]/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function productWhatsappLink(
  product: {
    title: string;
    current_price: string;
  },
  customNumber?: string,
): string {
  return waLink(
    `Hi Wayaz! I'm interested in "${product.title}" - Ksh ${formatKsh(product.current_price)}. Is it available?`,
    customNumber,
  );
}

export function cartWhatsappLink(cart: Cart, customNumber?: string): string {
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
    customNumber,
  );
}

export async function fetchStoreSettings(): Promise<import("./types").StoreSettings> {
  return api.get<import("./types").StoreSettings>("/api/v1/catalog/settings/");
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

export function clearStoredCart(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CART_KEY);
  }
}

export interface CheckoutPayload {
  email: string;
  phone_number: string;
  full_name: string;
  county: string;
  town: string;
  street_address: string;
  delivery_method?: string;
  payment_method?: "cod" | "mpesa";
  guest_id?: string;
  coupon_code?: string;
}

/** What POST .../coupons/validate/ says a code is worth on the current cart. */
export interface CouponValidation {
  code: string;
  discount_type: "percent" | "fixed";
  /** Discount for the cart as it stands right now. */
  discount_amount: string;
  cart_subtotal: string;
  /** False when the shopper typed the code; true for an auto preview. */
  auto_applied: boolean;
}

/** Dry-run a coupon against the caller's cart (guests included). */
export function validateCoupon(code: string): Promise<CouponValidation> {
  return api.post<CouponValidation>(
    "/api/v1/orders/coupons/validate/",
    { code },
    { headers: cartHeaders() },
  );
}

/**
 * The coupon that would apply itself to the caller's cart right now, or
 * null when nothing qualifies (empty cart, no matching promotion, ...).
 */
export function fetchAutoCoupon(): Promise<CouponValidation | null> {
  return api
    .post<CouponValidation & { code: string | null }>(
      "/api/v1/orders/coupons/validate/",
      {},
      { headers: cartHeaders() },
    )
    .then((preview) =>
      preview.code === null || Number(preview.discount_amount) <= 0
        ? null
        : (preview as CouponValidation),
    );
}

export function submitCheckout(payload: CheckoutPayload): Promise<StoreOrder> {
  return api
    .post<StoreOrder>("/api/v1/orders/checkout/", payload, {
      headers: cartHeaders(),
    })
    .then((order) => {
      clearStoredCart();
      return order;
    });
}

// ---- M-Pesa Payment Helpers -------------------------------------------

export interface MpesaInitiateResponse {
  detail: string;
  checkout_request_id: string;
  order_number: string;
  amount: string;
  phone_number: string;
  is_mock?: boolean;
}

export interface PaymentStatusResponse {
  checkout_request_id: string;
  order_number: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  payment_status: "PENDING" | "PAID" | "FAILED";
  mpesa_receipt_number: string | null;
  result_desc: string;
}

export function initiateMpesaStkPush(
  order_number: string,
  phone_number: string,
): Promise<MpesaInitiateResponse> {
  return api.post<MpesaInitiateResponse>("/api/v1/payments/mpesa/stk-push/", {
    order_number,
    phone_number,
  });
}

export function pollPaymentStatus(
  checkout_request_id: string,
): Promise<PaymentStatusResponse> {
  return api.get<PaymentStatusResponse>(
    `/api/v1/payments/status/${encodeURIComponent(checkout_request_id)}/`,
  );
}

export function simulateMockPayment(
  checkout_request_id: string,
  action: "success" | "fail" = "success",
): Promise<{ detail: string; status: string; mpesa_receipt_number?: string }> {
  return api.post("/api/v1/payments/mock-simulate/", {
    checkout_request_id,
    action,
  });
}

// ---- Customer Saved Addresses ----------------------------------------

export function fetchUserAddresses(): Promise<Paginated<Address>> {
  return api.get<Paginated<Address>>("/api/v1/auth/addresses/");
}

export function createAddress(address: {
  full_name: string;
  phone_number: string;
  county: string;
  town: string;
  street_address: string;
  is_default?: boolean;
}): Promise<Address> {
  return api.post<Address>("/api/v1/auth/addresses/", address);
}

export function updateAddress(
  id: number,
  address: Partial<{
    full_name: string;
    phone_number: string;
    county: string;
    town: string;
    street_address: string;
    is_default: boolean;
  }>,
): Promise<Address> {
  return api.patch<Address>(`/api/v1/auth/addresses/${id}/`, address);
}

export function deleteAddress(id: number): Promise<void> {
  return api.delete<void>(`/api/v1/auth/addresses/${id}/`);
}

/** PATCH /api/v1/auth/me/ response (UserSerializer). */
export interface AccountProfile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  role: string;
  display_name: string;
}

/** GET /api/v1/auth/me/ - the signed-in shopper's full profile. */
export function fetchUserProfile(): Promise<AccountProfile> {
  return api.get<AccountProfile>("/api/v1/auth/me/");
}

export function updateUserProfile(profile: {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
}): Promise<AccountProfile> {
  return api.patch<AccountProfile>("/api/v1/auth/me/", profile);
}

/** POST /api/v1/auth/change-password/ - swaps the caller's password. */
export function changePassword(
  old_password: string,
  new_password: string,
): Promise<{ detail: string }> {
  return api.post<{ detail: string }>("/api/v1/auth/change-password/", {
    old_password,
    new_password,
  });
}

/** POST /api/v1/auth/forgot-password/ - asks for a mailed reset link.
 * Answers identically whether or not the address exists. */
export function forgotPassword(email: string): Promise<{ detail: string }> {
  return api.post<{ detail: string }>("/api/v1/auth/forgot-password/", {
    email,
  });
}

/** POST /api/v1/auth/reset-password/ - exchanges a mailed link for a new
 * password. Succeeding retires every session issued before the change. */
export function resetPassword(
  uidb64: string,
  token: string,
  new_password: string,
): Promise<{ detail: string }> {
  return api.post<{ detail: string }>("/api/v1/auth/reset-password/", {
    uidb64,
    token,
    new_password,
  });
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

let cachedCatalog: StorefrontCatalog | null = null;
let cachedCatalogTime = 0;
let catalogInFlight: Promise<StorefrontCatalog> | null = null;
const CATALOG_CACHE_TTL_MS = 60_000; // 1 minute fresh window

/** Loads every category plus all product pages (up to 1,000 products), cached in memory. */
export function fetchStorefrontCatalog(forceRefresh = false): Promise<StorefrontCatalog> {
  const now = Date.now();
  if (!forceRefresh && cachedCatalog && now - cachedCatalogTime < CATALOG_CACHE_TTL_MS) {
    return Promise.resolve(cachedCatalog);
  }
  if (!forceRefresh && catalogInFlight) {
    return catalogInFlight;
  }

  catalogInFlight = (async () => {
    try {
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

      const result: StorefrontCatalog = { categories: categories.results, products };
      cachedCatalog = result;
      cachedCatalogTime = Date.now();
      return result;
    } finally {
      catalogInFlight = null;
    }
  })();

  return catalogInFlight;
}
