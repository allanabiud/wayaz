from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from catalog.models import Category, Product
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
            status=Order.Status.PENDING_PAYMENT,
            payment_method=Order.PaymentMethod.M_PESA,
        )

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/admin/nav-counts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, {"orders": 1, "products": 1, "customers": 1})

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
        make_order("900.00", Order.Status.PENDING_PAYMENT)  # excluded from revenue
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
