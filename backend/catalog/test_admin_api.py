from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from catalog.models import Category, Product, ProductReview
from accounts.models import WishlistItem
from orders.models import Order, OrderItem

User = get_user_model()


class AdminAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin_user = User.objects.create_user(
            username="admin_user",
            email="admin@wayaz.com",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
            is_staff=True,
        )

        # Normal customer
        self.customer = User.objects.create_user(
            username="customer_user",
            email="customer@wayaz.com",
            password="CustomerPassword123!",
            role=User.Role.CUSTOMER,
        )

        self.category = Category.objects.create(name="Shoes", slug="shoes")

        self.product = Product.objects.create(
            title="Air Max 90",
            category=self.category,
            base_price=12000.00,
            stock_quantity=3,  # Low stock
        )

    def test_admin_overview_forbidden_for_customers(self):
        # Anonymous
        res = self.client.get("/api/v1/admin/overview/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Authenticated as customer
        self.client.force_authenticate(user=self.customer)
        res = self.client.get("/api/v1/admin/overview/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_overview_success_for_staff(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/admin/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", res.data)
        self.assertIn("low_stock_alerts", res.data)
        self.assertIn("top_products", res.data)
        self.assertEqual(res.data["kpis"]["total_products"], 1)
        self.assertEqual(res.data["kpis"]["products_added_this_month"], 1)
        # setUp customer joined today
        self.assertEqual(res.data["kpis"]["new_customers_this_month"], 1)
        # No orders yet, so no sales-based top products
        self.assertEqual(res.data["top_products"], [])
        self.assertEqual(res.data["sales_summary"]["units_sold"], 0)
        self.assertEqual(len(res.data["low_stock_alerts"]), 1)
        self.assertIn("revenue_series", res.data)
        self.assertEqual(len(res.data["revenue_series"]), 30)
        self.assertIn("revenue_summary", res.data)
        self.assertEqual(res.data["revenue_summary"]["orders_total"], 0)
        self.assertEqual(res.data["revenue_summary"]["prev_30d"], 0)
        self.assertIn("orders_series", res.data)
        self.assertEqual(len(res.data["orders_series"]), 8)
        self.assertEqual(res.data["orders_series"][-1]["orders"], 0)

        # Period series for the dashboard bar chart's time filter.
        for key, length in (
            ("orders_series_today", 24),
            ("orders_series_week", 7),
            ("orders_series_month", timezone.localdate().day),
        ):
            self.assertIn(key, res.data)
            self.assertEqual(len(res.data[key]), length)
            self.assertTrue(
                all(point["orders"] == 0 for point in res.data[key])
            )

    def test_admin_nav_counts(self):
        Order.objects.create(
            email="buyer@example.com",
            phone_number="+254700000002",
            shipping_name="Buyer Two",
            county="Mombasa",
            town="Nyali",
            street_address="2 Cedar Rd",
            delivery_method="upcountry_courier",
            subtotal=Decimal("1500.00"),
            shipping_fee=Decimal("600.00"),
            total_amount=Decimal("2100.00"),
            status=Order.Status.PROCESSING,
            payment_method=Order.PaymentMethod.M_PESA,
        )

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/admin/nav-counts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res.data,
            {
                "orders": 1,
                "products": 1,
                "categories": 1,
                "reviews": 0,
                "coupons": 0,
                "team": 1,
                "customers": 1,
                "payments": 0,  # 0 PaymentTransactions + 0 COD orders in test data
            },
        )

    def test_admin_orders_forbidden_for_customers(self):
        self.assertEqual(
            self.client.get("/api/v1/admin/orders/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.client.force_authenticate(user=self.customer)
        self.assertEqual(
            self.client.get("/api/v1/admin/orders/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_admin_orders_filters_and_pending_count(self):
        def make_order(order_status, name):
            return Order.objects.create(
                email=f"{name.split()[0].lower()}@example.com",
                phone_number="+254700000002",
                shipping_name=name,
                county="Mombasa",
                town="Nyali",
                street_address="2 Cedar Rd",
                delivery_method="upcountry_courier",
                subtotal=Decimal("1500.00"),
                shipping_fee=Decimal("600.00"),
                total_amount=Decimal("2100.00"),
                status=order_status,
                payment_method=Order.PaymentMethod.M_PESA,
            )

        amina_pending = make_order(Order.Status.PROCESSING, "Amina Ali")
        make_order(Order.Status.CONFIRMED, "Brian Otieno")
        make_order(Order.Status.DELIVERED, "Amina Ali")
        make_order(Order.Status.CANCELLED, "Brian Otieno")

        self.client.force_authenticate(user=self.admin_user)

        # No filters: everything, newest first, pending count on top.
        res = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 4)
        self.assertEqual(res.data["pending_count"], 2)
        self.assertEqual(len(res.data["results"]), 4)
        self.assertEqual(res.data["results"][0]["status"], "CANCELLED")

        # status=pending excludes delivered and cancelled.
        res = self.client.get("/api/v1/admin/orders/?status=pending")
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(res.data["pending_count"], 2)

        # A single pipeline status.
        res = self.client.get("/api/v1/admin/orders/?status=DELIVERED")
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["status_display"], "Delivered")

        # Search matches shipping name and order number.
        res = self.client.get("/api/v1/admin/orders/?search=Amina")
        self.assertEqual(res.data["count"], 2)
        res = self.client.get(
            f"/api/v1/admin/orders/?search={amina_pending.order_number}"
        )
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(
            res.data["results"][0]["customer"], "Amina Ali"
        )
        self.assertEqual(res.data["results"][0]["total_amount"], "2100.00")
        self.assertEqual(res.data["results"][0]["item_count"], 0)

    def test_admin_overview_revenue_reflects_confirmed_orders(self):
        def make_order(total, order_status):
            return Order.objects.create(
                email="buyer@example.com",
                phone_number="+254700000001",
                shipping_name="Buyer One",
                county="Nairobi",
                town="Westlands",
                street_address="1 Some Road",
                delivery_method="nairobi_doorstep",
                subtotal=total,
                shipping_fee=0,
                total_amount=total,
                status=order_status,
                payment_method=Order.PaymentMethod.COD,
            )

        make_order("2500.00", Order.Status.PROCESSING)
        make_order("1000.00", Order.Status.DELIVERED)
        make_order("900.00", Order.Status.CANCELLED)  # excluded from revenue
        make_order("700.00", Order.Status.CANCELLED)  # excluded from revenue

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/admin/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        summary = res.data["revenue_summary"]
        self.assertEqual(summary["orders_total"], 4)
        self.assertEqual(summary["pending_orders"], 1)
        self.assertEqual(summary["total"], 3500.0)

        # Today's confirmed revenue appears on the final series point.
        series = res.data["revenue_series"]
        self.assertEqual(len(series), 30)
        self.assertEqual(series[-1]["revenue"], 3500.0)
        self.assertEqual(series[-1]["orders"], 2)
        # Older points are empty.
        self.assertEqual(series[0], {
            "date": series[0]["date"],
            "revenue": 0,
            "orders": 0,
        })

        # All four orders were placed this week.
        orders_series = res.data["orders_series"]
        self.assertEqual(len(orders_series), 8)
        self.assertEqual(orders_series[-1]["orders"], 4)
        self.assertEqual(sum(point["orders"] for point in orders_series), 4)

        # The period series drive the dashboard's time filter, so each one
        # must sum to the matching time_metrics KPI shown beside it.
        metrics = res.data["time_metrics"]["orders"]
        for key, period in (
            ("orders_series_today", "today"),
            ("orders_series_week", "week"),
            ("orders_series_month", "month"),
        ):
            series = res.data[key]
            self.assertEqual(
                sum(point["orders"] for point in series),
                metrics[period]["current"],
            )
            self.assertEqual(metrics[period]["current"], 4)

    def _make_sale(
        self,
        product,
        quantity,
        unit_price,
        order_status=Order.Status.PROCESSING,
    ):
        order = Order.objects.create(
            email="buyer@example.com",
            phone_number="+254700000003",
            shipping_name="Sales Buyer",
            county="Nairobi",
            town="Kilimani",
            street_address="12 Riara Road",
            delivery_method="nairobi_doorstep",
            subtotal=Decimal("0.00"),
            shipping_fee=Decimal("0.00"),
            total_amount=Decimal("0.00"),
            status=order_status,
            payment_method=Order.PaymentMethod.COD,
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            product_title=product.title,
            unit_price=unit_price,
            quantity=quantity,
        )
        return order

    def test_admin_overview_top_products_ranked_by_sales(self):
        second = Product.objects.create(
            title="Pegasus Zoom",
            category=self.category,
            base_price=9000.00,
            stock_quantity=20,
        )

        # Air Max 90: 5 x 2,500 = 12,500 · Pegasus: 2 x 3,000 = 6,000
        self._make_sale(self.product, 5, Decimal("2500.00"))
        self._make_sale(second, 2, Decimal("3000.00"))

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/admin/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        top = res.data["top_products"]
        self.assertEqual(len(top), 2)
        self.assertEqual(top[0]["title"], "Air Max 90")
        self.assertEqual(top[0]["units_sold"], 5)
        self.assertEqual(top[0]["revenue"], 12500.0)
        self.assertEqual(top[1]["title"], "Pegasus Zoom")
        self.assertEqual(top[1]["units_sold"], 2)
        self.assertEqual(top[1]["revenue"], 6000.0)
        self.assertEqual(res.data["sales_summary"]["units_sold"], 7)

    def test_admin_overview_top_lists_capped_at_five(self):
        # Six products, each outselling the last, so the cap drops the
        # lowest-ranked one rather than an arbitrary row.
        for i in range(6):
            product = Product.objects.create(
                title=f"Runner {i}",
                category=self.category,
                base_price=1000.00,
                stock_quantity=10,
            )
            self._make_sale(product, i + 1, Decimal("1000.00"))
            WishlistItem.objects.create(user=self.customer, product=product)

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/admin/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        top = res.data["top_products"]
        self.assertEqual(len(top), 5)
        self.assertEqual(top[0]["title"], "Runner 5")
        self.assertEqual(top[-1]["title"], "Runner 1")

        # The wishlist ranking is capped the same way.
        self.assertEqual(len(res.data["top_wishlisted"]), 5)

    def test_admin_overview_top_products_excludes_cancelled(self):
        self._make_sale(
            self.product,
            3,
            Decimal("2500.00"),
            order_status=Order.Status.CANCELLED,
        )

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/admin/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["top_products"], [])

    def test_admin_create_product(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "title": "Air Force 1",
            "category_id": self.category.id,
            "description": "Classic all-white sneakers",
            "base_price": "9500.00",
            "stock_quantity": 35,
        }
        res = self.client.post("/api/v1/admin/products/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Product.objects.count(), 2)
        created_product = Product.objects.get(title="Air Force 1")
        self.assertEqual(created_product.stock_quantity, 35)

    def test_admin_adjust_product_stock(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f"/api/v1/admin/products/{self.product.id}/adjust-stock/"

        # Set absolute stock
        res = self.client.post(url, {"stock_quantity": 50}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 50)

        # Relative adjustment
        res = self.client.post(url, {"adjustment": -10}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 40)


class AdminCategoryAPITestCase(TestCase):
    """Staff manage categories from the dashboard: create, rename, reorder,
    delete - but only once nothing still points at the category."""

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="cat_manager",
            email="cats@example.com",
            password="Password123!",
            role=User.Role.STAFF,
        )
        self.customer = User.objects.create_user(
            username="cat_buyer",
            email="cat_buyer@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        self.category = Category.objects.create(name="Jeans", display_order=1)
        self.product = Product.objects.create(
            title="Wide-Leg Jeans",
            category=self.category,
            base_price=3000.00,
            stock_quantity=4,
        )
        self.list_url = "/api/v1/admin/categories/"

    def test_anonymous_cannot_manage_categories(self):
        res = self.client.get(self.list_url)
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_customer_cannot_create_category(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(self.list_url, {"name": "Shorts"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_creates_category_with_derived_slug(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            self.list_url,
            {"name": "Summer Shorts", "display_order": 3},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["slug"], "summer-shorts")
        self.assertEqual(res.data["product_count"], 0)

    def test_duplicate_name_rejected(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(self.list_url, {"name": "Jeans"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rename_keeps_the_slug(self):
        # Bookmarks and storefront links must survive a rename.
        self.client.force_authenticate(user=self.staff)
        res = self.client.patch(
            f"{self.list_url}{self.category.id}/", {"name": "Denim"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.category.refresh_from_db()
        self.assertEqual(self.category.name, "Denim")
        self.assertEqual(self.category.slug, "jeans")

    def test_list_reports_product_counts(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        row = next(r for r in results if r["id"] == self.category.id)
        self.assertEqual(row["product_count"], 1)

    def test_delete_blocked_while_products_attached(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.delete(f"{self.list_url}{self.category.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Category.objects.filter(id=self.category.id).exists())
        # The refused delete must not have cascaded to the products.
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())

    def test_delete_empty_category_succeeds(self):
        empty = Category.objects.create(name="Hats")
        self.client.force_authenticate(user=self.staff)
        res = self.client.delete(f"{self.list_url}{empty.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Category.objects.filter(id=empty.id).exists())


class AdminReviewAPITestCase(TestCase):
    """Staff moderate reviews: list/search them, hide, restore or delete."""

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="review_manager",
            email="reviews@example.com",
            password="Password123!",
            role=User.Role.STAFF,
        )
        self.customer = User.objects.create_user(
            username="review_buyer",
            email="review_buyer@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        self.category = Category.objects.create(name="Denim", slug="denim")
        self.product = Product.objects.create(
            title="Wide-Leg Jeans",
            category=self.category,
            base_price=3000.00,
            stock_quantity=4,
        )
        self.approved = ProductReview.objects.create(
            product=self.product,
            user=self.customer,
            rating=5,
            comment="Perfect fit",
        )
        self.hidden = ProductReview.objects.create(
            product=self.product,
            user=self.staff,
            rating=1,
            comment="Rude rant",
            is_approved=False,
        )
        self.list_url = "/api/v1/admin/reviews/"

    def test_customer_cannot_moderate_reviews(self):
        self.client.force_authenticate(user=self.customer)
        self.assertIn(
            self.client.get(self.list_url).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        res = self.client.patch(
            f"{self.list_url}{self.approved.id}/",
            {"is_approved": False},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_filters_by_status_and_search(self):
        self.client.force_authenticate(user=self.staff)

        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)

        res = self.client.get(f"{self.list_url}?status=hidden")
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.hidden.id)

        res = self.client.get(f"{self.list_url}?status=approved")
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.approved.id)

        # Comment text...
        res = self.client.get(f"{self.list_url}?search=fit")
        self.assertEqual(res.data["count"], 1)
        # ...and product title both match.
        res = self.client.get(f"{self.list_url}?search=Wide-Leg")
        self.assertEqual(res.data["count"], 2)

    def test_hide_and_restore_review(self):
        self.client.force_authenticate(user=self.staff)

        res = self.client.patch(
            f"{self.list_url}{self.approved.id}/",
            {"is_approved": False},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.approved.refresh_from_db()
        self.assertFalse(self.approved.is_approved)

        res = self.client.patch(
            f"{self.list_url}{self.approved.id}/",
            {"is_approved": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.approved.refresh_from_db()
        self.assertTrue(self.approved.is_approved)

    def test_moderation_cannot_rewrite_the_review(self):
        # Hide or delete, never edit: the text stays the shopper's.
        self.client.force_authenticate(user=self.staff)
        res = self.client.patch(
            f"{self.list_url}{self.approved.id}/",
            {"is_approved": True, "comment": "edited by staff", "rating": 1},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.approved.refresh_from_db()
        self.assertEqual(self.approved.comment, "Perfect fit")
        self.assertEqual(self.approved.rating, 5)

    def test_reviews_cannot_be_created_from_the_admin_api(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            self.list_url,
            {"product": self.product.id, "user": self.customer.id, "rating": 5},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(ProductReview.objects.count(), 2)

    def test_delete_review(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.delete(f"{self.list_url}{self.hidden.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProductReview.objects.filter(id=self.hidden.id).exists())
