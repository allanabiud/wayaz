"""Throwaway Phase-6 measurement — delete after running."""

from django.core.cache import cache
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Category, Product, ProductImage
from orders.models import Order, OrderItem


class Phase6QueryCountTest(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        cat = Category.objects.create(name="Tees", slug="tees")
        for i in range(8):
            product = Product.objects.create(
                title=f"Tee {i}",
                base_price=1000,
                category=cat,
                stock_quantity=10,
            )
            for j in range(3):
                ProductImage.objects.create(
                    product=product,
                    image=f"products/{i}-{j}.jpg",
                    is_primary=(j == 0),
                    display_order=j,
                )

    def test_product_list_queries_constant(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get("/api/v1/catalog/products/")
        self.assertEqual(response.status_code, 200)
        count = len(ctx.captured_queries)
        print(f"\nPRODUCT LIST (8 products x 3 images): {count} queries")
        for q in ctx.captured_queries:
            print(f"  - {q['sql'][:110]}")
        # 3 = DRF pagination COUNT + SELECT products + SELECT images (the
        # single prefetched batch). The old N+1 added +1 per product.
        self.assertEqual(count, 3, "expected exactly 3 queries, no N+1")

    def test_order_history_queries_constant(self):
        user = User.objects.create_user(
            username="perf", email="perf@x.com", password="x"
        )
        small = self._build_orders(user, 4)
        cache.clear()
        self.client.force_authenticate(user=user)
        # Warm the StoreSettings singleton so the cold get_or_create insert
        # doesn't count against the per-request query budget; we want to
        # measure the steady-state list cost, not one-time setup.
        self.client.get("/api/v1/orders/")
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get("/api/v1/orders/")
        self.assertEqual(response.status_code, 200)
        small_count = len(ctx.captured_queries)

        # Triple the order count: if an N+1 survived, queries would grow.
        # No cache.clear() here - we want the warm steady-state cost, which
        # is what a real browsing session looks like after the first request.
        for i in range(8, 12):
            Order.objects.create(
                user=user,
                email="perf@x.com",
                subtotal=2000,
                total_amount=2000,
                payment_method="mpesa",
                payment_status="PENDING",
            )
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get("/api/v1/orders/")
        self.assertEqual(response.status_code, 200)
        large_count = len(ctx.captured_queries)

        print(
            f"\nORDER HISTORY: {small} orders -> {small_count} queries, "
            f"12 orders -> {large_count} queries"
        )
        for q in ctx.captured_queries:
            print(f"  - {q['sql'][:110]}")

        # The real invariant: query count does not scale with row count.
        self.assertEqual(
            small_count,
            large_count,
            f"order history N+1: {small} rows used {small_count} queries "
            f"but 12 rows used {large_count}",
        )
        self.assertLessEqual(
            large_count, 10, "order history uses more queries than expected"
        )

    def _build_orders(self, user, n):
        for i in range(n):
            order = Order.objects.create(
                user=user,
                email="perf@x.com",
                subtotal=2000,
                total_amount=2000,
                payment_method="mpesa",
                payment_status="PENDING",
            )
            OrderItem.objects.create(
                order=order,
                product_title=f"Tee {i}",
                unit_price=1000,
                quantity=2,
            )
        return n
