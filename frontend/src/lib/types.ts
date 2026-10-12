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
  phone_number?: string;
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

export interface TimeMetric {
  current: number;
  previous: number;
  percent: number;
}

export interface TimeMetrics {
  revenue: {
    today: TimeMetric;
    week: TimeMetric;
    month: TimeMetric;
  };
  orders: {
    today: TimeMetric;
    week: TimeMetric;
    month: TimeMetric;
  };
  customers: {
    today: TimeMetric;
    week: TimeMetric;
    month: TimeMetric;
  };
}

export interface TopWishlistedProduct {
  id: number;
  title: string;
  saves: number;
  price: number;
  stock: number;
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
  time_metrics?: TimeMetrics;
  low_stock_alerts: LowStockAlert[];
  stock_by_category: StockByCategory[];
  recent_activity: RecentActivity[];
  top_products: TopProduct[];
  top_wishlisted?: TopWishlistedProduct[];
  sales_summary: { units_sold: number; wishlist_saves?: number };
  revenue_series: RevenuePoint[];
  revenue_series_today?: RevenuePoint[];
  revenue_series_week?: RevenuePoint[];
  revenue_series_month?: RevenuePoint[];
  revenue_summary: RevenueSummary;
  orders_series: OrdersWeek[];
  orders_series_today?: OrderPoint[];
  orders_series_week?: OrderPoint[];
  orders_series_month?: OrderPoint[];
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

/** Bucketed order counts driving the dashboard bar chart's time filter. */
export interface OrderPoint {
  date: string;
  orders: number;
}

export interface NavCounts {
  orders: number;
  products: number;
  categories: number;
  customers: number;
}

export interface StockByCategory {
  name: string;
  units: number;
  products: number;
}

export type ActivityType = "order" | "product" | "customer";

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

export interface Address {
  id: number;
  full_name: string;
  phone_number: string;
  county: string;
  town: string;
  street_address: string;
  is_default: boolean;
  created_at: string;
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

export interface AdminOrderItem {
  id: number;
  product_title: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface AdminOrder {
  id: number;
  order_number: string;
  customer: string;
  email: string;
  phone_number: string;
  county: string;
  town: string;
  street_address: string;
  status: string;
  status_display: string;
  payment_method: string;
  payment_method_display: string;
  payment_status: string;
  total_amount: string;
  subtotal: string;
  shipping_fee: string;
  item_count: number;
  items: AdminOrderItem[];
  created_at: string;
}

export interface AdminOrdersResponse {
  count: number;
  page: number;
  page_size: number;
  pending_count: number;
  results: AdminOrder[];
}

export interface AnalyticsKpis {
  gross_sales: number;
  net_sales: number;
  total_discount: number;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  aov: number;
  fulfillment_rate: number;
  cancellation_rate: number;
  repeat_customer_rate: number;
}

export interface AnalyticsTimelinePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface AnalyticsStatusItem {
  status: string;
  label: string;
  count: number;
}

export interface AnalyticsPaymentMethod {
  payment_method: string;
  count: number;
  volume: number;
}

export interface AnalyticsTopProduct {
  product_id: number;
  title: string;
  units_sold: number;
  revenue: number;
}

export interface AnalyticsDestination {
  county: string;
  orders: number;
  volume: number;
}

export interface AnalyticsDeadStock {
  id: number;
  title: string;
  stock_quantity: number;
  base_price: string;
}

export interface AnalyticsData {
  period: string;
  start_date: string;
  end_date: string;
  kpis: AnalyticsKpis;
  timeline: AnalyticsTimelinePoint[];
  status_distribution: AnalyticsStatusItem[];
  payment_methods: AnalyticsPaymentMethod[];
  top_products: AnalyticsTopProduct[];
  destinations: AnalyticsDestination[];
  dead_stock: AnalyticsDeadStock[];
}


