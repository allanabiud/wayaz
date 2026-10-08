from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from catalog.models import Category, Product
from orders.models import Cart, CartItem, Order, OrderItem

User = get_user_model()


class CartAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.category = Category.objects.create(name="Shoes", slug="shoes")
        self.product_1 = Product.objects.create(
            title="Running Sneaker",
            category=self.category,
            base_price=3000.00,
            sale_price=2500.00,
            stock_quantity=5,
        )
        self.product_2 = Product.objects.create(
            title="Court Sneaker",
            category=self.category,
            base_price=3000.00,
            sale_price=2500.00,
            stock_quantity=10,
        )

        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="Password123!",
        )

    def test_anonymous_cart_creation(self):
        # Initial request should return a new cart and X-Cart-ID header
        res = self.client.get("/api/v1/orders/cart/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("X-Cart-ID", res.headers)
        cart_id = res.headers["X-Cart-ID"]
        self.assertEqual(res.data["total_items"], 0)
        self.assertEqual(Decimal(str(res.data["subtotal"])), Decimal("0.00"))

    def test_add_item_to_guest_cart(self):
        # 1. Start guest cart
        init_res = self.client.get("/api/v1/orders/cart/")
        cart_id = init_res.headers["X-Cart-ID"]

        # 2. Add 2 units of product 1
        payload = {"product_id": self.product_1.id, "quantity": 2}
        add_res = self.client.post(
            "/api/v1/orders/cart/items/",
            payload,
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(add_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(add_res.data["total_items"], 2)
        # 2 * 2500.00 = 5000.00
        self.assertEqual(Decimal(str(add_res.data["subtotal"])), Decimal("5000.00"))
        # Cart line now embeds product info instead of variant info
        line = add_res.data["items"][0]
        self.assertEqual(line["product"]["product_title"], "Running Sneaker")
        self.assertEqual(Decimal(str(line["product"]["unit_price"])), Decimal("2500.00"))

    def test_add_item_exceeding_stock_rejected(self):
        init_res = self.client.get("/api/v1/orders/cart/")
        cart_id = init_res.headers["X-Cart-ID"]

        # product_1 only has stock of 5
        payload = {"product_id": self.product_1.id, "quantity": 10}
        res = self.client.post(
            "/api/v1/orders/cart/items/",
            payload,
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res.data)

    def test_update_cart_item_quantity_and_delete(self):
        init_res = self.client.get("/api/v1/orders/cart/")
        cart_id = init_res.headers["X-Cart-ID"]

        add_res = self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": self.product_2.id, "quantity": 1},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        item_id = add_res.data["items"][0]["id"]

        # Update quantity to 4
        patch_res = self.client.patch(
            f"/api/v1/orders/cart/items/{item_id}/",
            {"quantity": 4},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["total_items"], 4)

        # Delete item
        del_res = self.client.delete(
            f"/api/v1/orders/cart/items/{item_id}/",
            HTTP_X_CART_ID=cart_id,
        )
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertEqual(del_res.data["total_items"], 0)

    def test_cart_merge_on_login(self):
        # 1. Guest adds item to guest cart
        init_res = self.client.get("/api/v1/orders/cart/")
        guest_cart_id = init_res.headers["X-Cart-ID"]

        self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": self.product_2.id, "quantity": 3},
            HTTP_X_CART_ID=guest_cart_id,
            format="json",
        )

        # 2. Authenticate as user
        self.client.force_authenticate(user=self.user)

        # 3. Merge guest cart into user's account
        merge_res = self.client.post(
            "/api/v1/orders/cart/merge/",
            {"guest_cart_id": guest_cart_id},
            format="json",
        )
        self.assertEqual(merge_res.status_code, status.HTTP_200_OK)
        self.assertEqual(merge_res.data["total_items"], 3)
        # Guest cart should have been deleted/merged
        self.assertFalse(Cart.objects.filter(id=guest_cart_id).exists())


class CheckoutAPITestCase(TestCase):
    """Phase 6: checkout validation, atomic stock deduction, order creation."""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Shirts", slug="shirts")
        self.product = Product.objects.create(
            title="Linen Shirt",
            category=self.category,
            base_price=3000.00,
            sale_price=2500.00,
            stock_quantity=5,
        )

        self.cart = Cart.objects.create()
        CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)

        self.checkout_payload = {
            "email": "shopper@example.com",
            "phone_number": "+254712345678",
            "full_name": "Jane Wanjiku",
            "county": "Nairobi",
            "town": "Kilimani",
            "street_address": "12 Riara Road",
            "delivery_method": "nairobi_doorstep",
            "payment_method": "cod",
        }

    def checkout(self, payload=None, cart_id=None):
        return self.client.post(
            "/api/v1/orders/checkout/",
            payload or self.checkout_payload,
            format="json",
            **{"HTTP_X_CART_ID": cart_id or str(self.cart.id)},
        )

    def test_checkout_cod_creates_order_and_decrements_stock(self):
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Order fields
        self.assertTrue(res.data["order_number"].startswith("WAYAZ-"))
        self.assertEqual(res.data["status"], Order.Status.PROCESSING)
        self.assertEqual(res.data["payment_method"], Order.PaymentMethod.COD)
        self.assertEqual(res.data["payment_status"], Order.PaymentStatus.PENDING)

        # Financials: 2 * 2500.00 = 5000.00 -> free delivery threshold
        self.assertEqual(Decimal(str(res.data["subtotal"])), Decimal("5000.00"))
        self.assertEqual(Decimal(str(res.data["shipping_fee"])), Decimal("0.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("5000.00"))

        # Line item snapshots captured at purchase time
        self.assertEqual(len(res.data["items"]), 1)
        item = res.data["items"][0]
        self.assertEqual(item["product_title"], "Linen Shirt")
        self.assertEqual(Decimal(str(item["unit_price"])), Decimal("2500.00"))
        self.assertEqual(Decimal(str(item["line_total"])), Decimal("5000.00"))

        # Stock decremented atomically, cart cleared
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(self.cart.items.count(), 0)

        # WhatsApp link returned + confirmation email sent
        self.assertIn("wa.me/", res.data["whatsapp_link"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(res.data["order_number"], mail.outbox[0].subject)

        # COD carries the manual verification flag
        order = Order.objects.get(order_number=res.data["order_number"])
        self.assertTrue(order.requires_manual_verification)
        self.assertEqual(order.guest_id, str(self.cart.id))

    def test_checkout_delivery_fee_applied_below_threshold(self):
        CartItem.objects.filter(cart=self.cart).update(quantity=1)  # 2500.00
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["shipping_fee"])), Decimal("300.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("2800.00"))

    def test_checkout_rejects_insufficient_stock(self):
        # Bypass the cart API to simulate a stale cart (qty > stock).
        CartItem.objects.filter(cart=self.cart).update(quantity=99)
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 5)
        self.assertEqual(self.cart.items.count(), 1)

    def test_checkout_rejects_empty_cart(self):
        empty_cart = Cart.objects.create()
        res = self.checkout(cart_id=str(empty_cart.id))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)

    def test_checkout_rejects_unknown_delivery_zone(self):
        payload = {**self.checkout_payload, "delivery_method": "mars_base"}
        res = self.checkout(payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)

    def test_checkout_mpesa_stays_pending_payment(self):
        payload = {**self.checkout_payload, "payment_method": "mpesa"}
        res = self.checkout(payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], Order.Status.PENDING_PAYMENT)
        order = Order.objects.get(order_number=res.data["order_number"])
        self.assertFalse(order.requires_manual_verification)
        # Stock stays reserved while awaiting the STK push.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

    def test_authenticated_checkout_attaches_user(self):
        user = User.objects.create_user(
            username="buyer", email="buyer@example.com", password="Password123!"
        )
        # Authenticated shoppers resolve their own cart, not the guest one.
        self.cart.user = user
        self.cart.save()
        self.client.force_authenticate(user=user)
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(order_number=res.data["order_number"])
        self.assertEqual(order.user, user)
        self.assertEqual(order.guest_id, "")

    def test_order_cancel_restores_stock(self):
        res = self.checkout()
        order = Order.objects.get(order_number=res.data["order_number"])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

        order.cancel()
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 5)

    def test_order_number_format(self):
        res = self.checkout()
        order_number = res.data["order_number"]
        parts = order_number.split("-")
        self.assertEqual(len(parts), 3)
        self.assertEqual(parts[0], "WAYAZ")
        self.assertEqual(len(parts[1]), 4)  # YYMM
        self.assertEqual(len(parts[2]), 4)  # XXXX


class OrderHistoryAPITestCase(TestCase):
    """GET /api/v1/orders/ - account-scoped order history (storefront dropdown)."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="history_buyer",
            email="history@example.com",
            password="Password123!",
        )
        self.other_user = User.objects.create_user(
            username="other_buyer",
            email="other@example.com",
            password="Password123!",
        )

        self.first_order = self.make_order(self.user)
        self.second_order = self.make_order(self.user)
        # Someone else's order must never leak into this account's history.
        self.make_order(self.other_user)
        # Guest checkouts are tied to a cart id, not an account.
        self.make_order(None)

    def make_order(self, user):
        return Order.objects.create(
            user=user,
            guest_id="" if user else "guest-abc",
            email="shopper@example.com",
            phone_number="+254712345678",
            shipping_name="Jane Wanjiku",
            county="Nairobi",
            town="Kilimani",
            street_address="12 Riara Road",
            delivery_method="nairobi_doorstep",
            subtotal=Decimal("2500.00"),
            total_amount=Decimal("2500.00"),
        )

    def test_order_history_requires_authentication(self):
        res = self.client.get("/api/v1/orders/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_only_own_orders_newest_first(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/v1/orders/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        order_numbers = [o["order_number"] for o in res.data["results"]]
        self.assertEqual(
            order_numbers,
            [self.second_order.order_number, self.first_order.order_number],
        )

    def test_serializes_display_labels_and_items(self):
        OrderItem.objects.create(
            order=self.first_order,
            product_title="Linen Shirt",
            unit_price=Decimal("2500.00"),
            quantity=1,
        )
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/v1/orders/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        payload = res.data["results"][-1]  # oldest order carries the item
        self.assertEqual(payload["status_display"], "Pending payment")
        self.assertEqual(payload["payment_method_display"], "Cash on delivery")
        self.assertEqual(payload["delivery_method_display"], "Nairobi Doorstep")
        self.assertEqual(payload["item_count"], 1)
        self.assertEqual(payload["items"][0]["product_title"], "Linen Shirt")

    def test_paginates_with_standard_results_set(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/v1/orders/?page_size=1")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertIsNotNone(res.data["next"])
