import { api } from "@/lib/api";
import type {
  Address,
  Category,
  Paginated,
  ProductImage,
  SizeStock,
} from "@/lib/types";

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
  /** In-stock sizes with their remaining units; drives the quantity cap. */
  size_stock: SizeStock[];
  images: ProductImage[];
  // user_rating is null for anonymous/SSR callers until refreshed client-side.
  average_rating: number | null;
  rating_count: number;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
}

interface CartProduct {
  id: number;
  product_title: string;
  product_slug: string;
  unit_price: string;
  stock_quantity: number;
  is_in_stock: boolean;
  sizes: string[];
  thumbnail: string | null;
}

export interface CartLine {
  id: number;
  product: CartProduct;
  // "" when the product is one-size.
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

export type OrderStatus =
  "AWAITING_PAYMENT" | "PROCESSING" | "CONFIRMED" | "DELIVERED" | "CANCELLED";

interface StoreOrderItem {
  id: number;
  // Null once the product is removed from the catalog.
  product_slug: string | null;
  product_title: string;
  size: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

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
  coupon_code: string | null;
  item_count: number;
  items: StoreOrderItem[];
  whatsapp_link: string;
  created_at: string;
  // Capability token authorising M-Pesa calls for this order. Only in the
  // checkout response, never in order history.
  payment_token?: string;
}

export function fetchOrders(
  page = 1,
  pageSize = 10,
): Promise<Paginated<StoreOrder>> {
  return api.get(`/api/v1/orders/?page=${page}&page_size=${pageSize}`);
}

export interface ProductRatingSummary {
  average_rating: number | null;
  rating_count: number;
  user_rating: number | null;
}

export function fetchProductRating(
  slug: string,
): Promise<ProductRatingSummary> {
  return api.get(
    `/api/v1/catalog/products/${encodeURIComponent(slug)}/review/`,
  );
}

export interface ProductReview {
  id: number;
  rating: number;
  comment: string;
  reviewer: string;
  mine: boolean;
  created_at: string;
}

export function fetchProductReviews(
  slug: string,
  page = 1,
  pageSize = 10,
): Promise<Paginated<ProductReview>> {
  return api.get(
    `/api/v1/catalog/products/${encodeURIComponent(slug)}/reviews/?page=${page}&page_size=${pageSize}`,
  );
}

/** Omitting `comment` leaves the caller's existing written feedback intact. */
export function submitProductRating(
  slug: string,
  rating: number,
  comment?: string,
): Promise<ProductRatingSummary> {
  const body: { rating: number; comment?: string } = { rating };
  if (comment !== undefined) body.comment = comment;
  return api.post(
    `/api/v1/catalog/products/${encodeURIComponent(slug)}/review/`,
    body,
  );
}

export function formatKsh(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "254700000000";

export function whatsappNumber(
  settings?: { whatsapp_number?: string | null } | null,
): string {
  return settings?.whatsapp_number || WHATSAPP_NUMBER;
}

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

export async function fetchStoreSettings(): Promise<
  import("./types").StoreSettings
> {
  return api.get<import("./types").StoreSettings>("/api/v1/catalog/settings/");
}

// Guest cart, identified server-side by an X-Cart-ID header.

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

export function updateCartItem(
  item_id: number,
  quantity: number,
): Promise<Cart> {
  return api
    .patch<Cart>(
      `/api/v1/orders/cart/items/${item_id}/`,
      { quantity },
      { headers: cartHeaders() },
    )
    .then(rememberCart);
}

/** The server merges quantities when the target size already has a line. */
export function setCartItemSize(item_id: number, size: string): Promise<Cart> {
  return api
    .patch<Cart>(
      `/api/v1/orders/cart/items/${item_id}/`,
      { size },
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

function clearStoredCart(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CART_KEY);
  }
}

interface CheckoutPayload {
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

export interface CouponValidation {
  code: string;
  discount_type: "percent" | "fixed";
  discount_amount: string;
  cart_subtotal: string;
  auto_applied: boolean;
}

export function validateCoupon(code: string): Promise<CouponValidation> {
  return api.post<CouponValidation>(
    "/api/v1/orders/coupons/validate/",
    { code },
    { headers: cartHeaders() },
  );
}

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

export function submitCheckout(
  payload: CheckoutPayload,
): Promise<CheckoutOrder> {
  return api
    .post<CheckoutOrder>("/api/v1/orders/checkout/", payload, {
      headers: cartHeaders(),
    })
    .then((order) => {
      // M-Pesa keeps the cart until the payment is verified; only a
      // completed COD checkout takes ownership of it outright.
      if (payload.payment_method !== "mpesa") clearStoredCart();
      return order;
    });
}

/** StoreOrder plus the payment_token that authorises M-Pesa calls for it. */
export type CheckoutOrder = StoreOrder & { payment_token: string };

interface MpesaInitiateResponse {
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
  payment_token: string,
): Promise<MpesaInitiateResponse> {
  return api.post<MpesaInitiateResponse>("/api/v1/payments/mpesa/stk-push/", {
    order_number,
    phone_number,
    payment_token,
  });
}

export function pollPaymentStatus(
  checkout_request_id: string,
  payment_token: string,
): Promise<PaymentStatusResponse> {
  return api.get<PaymentStatusResponse>(
    `/api/v1/payments/status/${encodeURIComponent(checkout_request_id)}/?payment_token=${encodeURIComponent(payment_token)}`,
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

export function changePassword(
  old_password: string,
  new_password: string,
): Promise<{ detail: string }> {
  return api.post<{ detail: string }>("/api/v1/auth/change-password/", {
    old_password,
    new_password,
  });
}

/** Answers identically whether or not the address exists. */
export function forgotPassword(email: string): Promise<{ detail: string }> {
  return api.post<{ detail: string }>("/api/v1/auth/forgot-password/", {
    email,
  });
}

/** Succeeding retires every session issued before the change. */
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
        (term): term is string =>
          typeof term === "string" && term.trim() !== "",
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
      // Storage unavailable (e.g. private mode); history just won't persist.
    }
  }
  return terms;
}

/** Async so SSR markup never mismatches. */
export function storedSearchHistory(): Promise<string[]> {
  return Promise.resolve().then(readSearchHistory);
}

export function rememberSearch(term: string): string[] {
  const clean = term.trim();
  if (!clean) return readSearchHistory();
  const rest = readSearchHistory().filter(
    (saved) => saved.toLowerCase() !== clean.toLowerCase(),
  );
  return writeSearchHistory([clean, ...rest].slice(0, SEARCH_LIMIT));
}

export function forgetSearch(term: string): string[] {
  return writeSearchHistory(
    readSearchHistory().filter((saved) => saved !== term),
  );
}

export function clearSearchHistory(): string[] {
  return writeSearchHistory([]);
}

// Too generic to be useful as suggested searches.
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

let cachedCatalog: StorefrontCatalog | null = null;
let cachedCatalogTime = 0;
let catalogInFlight: Promise<StorefrontCatalog> | null = null;
const CATALOG_CACHE_TTL_MS = 60_000;

export function fetchStorefrontCatalog(
  forceRefresh = false,
): Promise<StorefrontCatalog> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedCatalog &&
    now - cachedCatalogTime < CATALOG_CACHE_TTL_MS
  ) {
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
        const page: Paginated<StoreProduct> =
          await api.get<Paginated<StoreProduct>>(path);
        products.push(...page.results);
        if (page.next) {
          const nextUrl = new URL(page.next);
          path = `${nextUrl.pathname}${nextUrl.search}`;
        } else {
          path = null;
        }
      }

      const result: StorefrontCatalog = {
        categories: categories.results,
        products,
      };
      cachedCatalog = result;
      cachedCatalogTime = Date.now();
      return result;
    } finally {
      catalogInFlight = null;
    }
  })();

  return catalogInFlight;
}
