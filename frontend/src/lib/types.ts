export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type UserRole = "customer" | "staff" | "admin";

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  display_name: string;
  is_staff: boolean;
  is_superuser: boolean;
}

export interface TokenResponse {
  access: string;
  refresh: string;
  user: SessionUser;
}

export interface Overview {
  kpis: {
    total_products: number;
    total_stock_units: number;
    out_of_stock_count: number;
    total_categories: number;
    total_customers: number;
    products_added_this_month: number;
    new_customers_this_month: number;
  };
  low_stock_alerts: LowStockAlert[];
  stock_by_category: StockByCategory[];
  recent_activity: RecentActivity[];
  top_products: TopProduct[];
  sales_summary: { units_sold: number };
  revenue_series: RevenuePoint[];
  revenue_summary: RevenueSummary;
  orders_series: OrdersWeek[];
}

export interface TopProduct {
  id: number;
  title: string;
  units_sold: number;
  revenue: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface RevenueSummary {
  total: number;
  this_month: number;
  orders_total: number;
  orders_this_month: number;
  pending_orders: number;
  prev_30d: number;
}

export interface OrdersWeek {
  week_start: string;
  orders: number;
}

export interface NavCounts {
  orders: number;
  products: number;
  customers: number;
}

export interface AdminOrder {
  order_number: string;
  customer: string;
  status: string;
  status_display: string;
  payment_method_display: string;
  total_amount: string;
  item_count: number;
  created_at: string;
}

export interface AdminOrdersResponse {
  count: number;
  pending_count: number;
  results: AdminOrder[];
}

export interface StockByCategory {
  name: string;
  units: number;
  products: number;
}

export type ActivityType = "product" | "customer";

export interface RecentActivity {
  type: ActivityType;
  title: string;
  detail: string;
  at: string;
}

export interface LowStockAlert {
  product_id: number;
  product_title: string;
  image_url?: string | null;
  stock_quantity: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  display_order: number;
  product_count: number;
}

export interface ProductImage {
  id: number;
  image: string;
  alt_text: string;
  is_primary: boolean;
  display_order: number;
}

export interface Product {
  id: number;
  title: string;
  slug: string;
  category_id: number;
  category_name: string;
  description: string;
  base_price: string;
  sale_price: string | null;
  stock_quantity: number;
  sizes: string[];
  is_in_stock: boolean;
  is_featured: boolean;
  images: ProductImage[];
  created_at: string;
  updated_at: string;
}

export interface ProductPayload {
  title: string;
  description: string;
  base_price: string;
  sale_price: string | null;
  category_id: number;
  stock_quantity: number;
  sizes: string[];
  is_featured: boolean;
}

export interface Customer {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  role: UserRole;
  display_name: string;
  is_active: boolean;
  date_joined: string;
  addresses_count: number;
  wishlist_count: number;
}

export interface ProductQuery {
  search?: string;
  category?: number | string;
  in_stock?: "true" | "false";
}
