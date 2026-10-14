from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from catalog.models import Category, Product
from orders.models import Cart, CartItem, Coupon, Order, OrderItem
from orders.tokens import verify_payment_token
from payments.models import PaymentTransaction

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
        res = self.client.get("/api/v1/orders/cart/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("X-Cart-ID", res.headers)
        cart_id = res.headers["X-Cart-ID"]
        self.assertEqual(res.data["total_items"], 0)
        self.assertEqual(Decimal(str(res.data["subtotal"])), Decimal("0.00"))

    def test_add_item_to_guest_cart(self):
        init_res = self.client.get("/api/v1/orders/cart/")
        cart_id = init_res.headers["X-Cart-ID"]

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
        line = add_res.data["items"][0]
        self.assertEqual(line["product"]["product_title"], "Running Sneaker")
        self.assertEqual(Decimal(str(line["product"]["unit_price"])), Decimal("2500.00"))

    def test_add_item_exceeding_stock_rejected(self):
        init_res = self.client.get("/api/v1/orders/cart/")
        cart_id = init_res.headers["X-Cart-ID"]

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

        patch_res = self.client.patch(
            f"/api/v1/orders/cart/items/{item_id}/",
            {"quantity": 4},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["total_items"], 4)

        del_res = self.client.delete(
            f"/api/v1/orders/cart/items/{item_id}/",
            HTTP_X_CART_ID=cart_id,
        )
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertEqual(del_res.data["total_items"], 0)

    def test_update_cart_item_size(self):
        sized = Product.objects.create(
            title="Denim Jacket",
            category=self.category,
            base_price=4000.00,
            stock_quantity=6,
            sizes=["M", "L"],
        )
        cart_id = self.client.get("/api/v1/orders/cart/").headers["X-Cart-ID"]
        add_res = self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": sized.id, "quantity": 2, "size": "M"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        item_id = add_res.data["items"][0]["id"]

        patch_res = self.client.patch(
            f"/api/v1/orders/cart/items/{item_id}/",
            {"size": "L"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(patch_res.data["items"]), 1)
        self.assertEqual(patch_res.data["items"][0]["size"], "L")
        self.assertEqual(patch_res.data["items"][0]["quantity"], 2)

        bad_res = self.client.patch(
            f"/api/v1/orders/cart/items/{item_id}/",
            {"size": "XL"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(bad_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("size", bad_res.data)

    def test_size_change_merges_into_the_matching_line(self):
        sized = Product.objects.create(
            title="Denim Jacket",
            category=self.category,
            base_price=4000.00,
            stock_quantity=6,
            sizes=["M", "L"],
        )
        cart_id = self.client.get("/api/v1/orders/cart/").headers["X-Cart-ID"]

        self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": sized.id, "quantity": 2, "size": "M"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        add_l = self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": sized.id, "quantity": 1, "size": "L"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        line_l = next(
            item for item in add_l.data["items"] if item["size"] == "L"
        )

        res = self.client.patch(
            f"/api/v1/orders/cart/items/{line_l['id']}/",
            {"size": "M"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["items"]), 1)
        self.assertEqual(res.data["items"][0]["size"], "M")
        self.assertEqual(res.data["items"][0]["quantity"], 3)

    def test_size_merge_respects_stock(self):
        sized = Product.objects.create(
            title="Denim Jacket",
            category=self.category,
            base_price=4000.00,
            stock_quantity=6,
            sizes=["M", "L"],
        )
        cart_id = self.client.get("/api/v1/orders/cart/").headers["X-Cart-ID"]

        self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": sized.id, "quantity": 3, "size": "M"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        add_l = self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": sized.id, "quantity": 3, "size": "L"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        line_l = next(
            item for item in add_l.data["items"] if item["size"] == "L"
        )

        # Stock drops to 5 between the adds and the merge: 3 + 3 no longer fits.
        Product.objects.filter(id=sized.id).update(stock_quantity=5)

        res = self.client.patch(
            f"/api/v1/orders/cart/items/{line_l['id']}/",
            {"size": "M"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res.data)
        self.assertEqual(
            CartItem.objects.filter(cart_id=cart_id, size="L").count(), 1
        )

    def test_cart_lines_expose_the_size_options(self):
        sized = Product.objects.create(
            title="Denim Jacket",
            category=self.category,
            base_price=4000.00,
            stock_quantity=6,
            sizes=["M", "L"],
        )
        cart_id = self.client.get("/api/v1/orders/cart/").headers["X-Cart-ID"]
        res = self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": sized.id, "quantity": 1, "size": "M"},
            HTTP_X_CART_ID=cart_id,
            format="json",
        )
        # The cart views render the size picker from this list.
        self.assertEqual(res.data["items"][0]["product"]["sizes"], ["M", "L"])

    def test_cart_merge_on_login(self):
        init_res = self.client.get("/api/v1/orders/cart/")
        guest_cart_id = init_res.headers["X-Cart-ID"]

        self.client.post(
            "/api/v1/orders/cart/items/",
            {"product_id": self.product_2.id, "quantity": 3},
            HTTP_X_CART_ID=guest_cart_id,
            format="json",
        )

        self.client.force_authenticate(user=self.user)

        merge_res = self.client.post(
            "/api/v1/orders/cart/merge/",
            {"guest_cart_id": guest_cart_id},
            format="json",
        )
        self.assertEqual(merge_res.status_code, status.HTTP_200_OK)
        self.assertEqual(merge_res.data["total_items"], 3)
        self.assertFalse(Cart.objects.filter(id=guest_cart_id).exists())


class CheckoutAPITestCase(TestCase):

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

        self.assertTrue(res.data["order_number"].startswith("WAYAZ-"))
        self.assertEqual(res.data["status"], Order.Status.PROCESSING)
        self.assertEqual(res.data["payment_method"], Order.PaymentMethod.COD)
        self.assertEqual(res.data["payment_status"], Order.PaymentStatus.PENDING)

        # Financials: 2 * 2500.00 = 5000.00 -> free delivery threshold
        self.assertEqual(Decimal(str(res.data["subtotal"])), Decimal("5000.00"))
        self.assertEqual(Decimal(str(res.data["shipping_fee"])), Decimal("0.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("5000.00"))

        self.assertEqual(len(res.data["items"]), 1)
        item = res.data["items"][0]
        self.assertEqual(item["product_title"], "Linen Shirt")
        self.assertEqual(Decimal(str(item["unit_price"])), Decimal("2500.00"))
        self.assertEqual(Decimal(str(item["line_total"])), Decimal("5000.00"))

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(self.cart.items.count(), 0)

        self.assertIn("wa.me/", res.data["whatsapp_link"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(res.data["order_number"], mail.outbox[0].subject)

        order = Order.objects.get(order_number=res.data["order_number"])
        self.assertEqual(order.status, Order.Status.PROCESSING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PENDING)
        self.assertEqual(order.guest_id, str(self.cart.id))

    def test_checkout_returns_payment_token(self):
        """The checkout response hands out the STK capability token that the
        payments endpoints require as a guest's ownership proof."""
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        token = res.data["payment_token"]
        order = Order.objects.get(order_number=res.data["order_number"])
        self.assertTrue(verify_payment_token(token, order))

        # A token minted for another order must not verify against this one.
        other = Order.objects.create(
            order_number="WAYAZ-2610-0001",
            email="other@example.com",
            phone_number="0711111111",
            shipping_name="Other Shopper",
            county="Nairobi",
            town="Kilimani",
            street_address="5 Riara Road",
            total_amount=Decimal("100.00"),
            payment_method=Order.PaymentMethod.COD,
        )
        self.assertFalse(verify_payment_token(token, other))

    @override_settings(MANAGER_EMAIL="boss@wayaz.co.ke")
    def test_checkout_sends_merchant_copy(self):
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 2)
        merchant_mails = [m for m in mail.outbox if "boss@wayaz.co.ke" in m.to]
        self.assertEqual(len(merchant_mails), 1)
        self.assertIn(res.data["order_number"], merchant_mails[0].subject)
        # The shopper still gets their own confirmation.
        self.assertIn(res.data["order_number"], mail.outbox[0].subject)

    def test_checkout_skips_merchant_copy_when_unconfigured(self):
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # Only the shopper confirmation; MANAGER_EMAIL is empty in tests.
        self.assertEqual(len(mail.outbox), 1)

    def test_checkout_delivery_fee_applied_below_threshold(self):
        CartItem.objects.filter(cart=self.cart).update(quantity=1)  # 2500.00
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["shipping_fee"])), Decimal("0.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("2500.00"))

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

    def test_checkout_requires_a_size_for_sized_products(self):
        """Cart lines may sit size-less until the shopper picks one, but the
        order itself must never be placed without a size."""
        sized = Product.objects.create(
            title="Denim Jacket",
            category=self.category,
            base_price=4000.00,
            stock_quantity=6,
            sizes=["M", "L"],
        )
        CartItem.objects.create(
            cart=self.cart, product=sized, quantity=1, size=""
        )

        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 5)

        # Choosing a size unblocks the same cart.
        line = CartItem.objects.get(product=sized, cart=self.cart)
        line.size = "M"
        line.save()
        ok = self.checkout()
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)

    def test_checkout_rejects_unknown_delivery_zone(self):
        payload = {**self.checkout_payload, "delivery_method": "mars_base"}
        res = self.checkout(payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)

    def test_checkout_mpesa_initiates_processing(self):
        payload = {**self.checkout_payload, "payment_method": "mpesa"}
        res = self.checkout(payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], Order.Status.PROCESSING)
        # Stock stays reserved while processing.
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
        self.assertEqual(payload["status_display"], "Processing")
        self.assertEqual(payload["payment_method_display"], "Cash on delivery")
        self.assertEqual(payload["delivery_method_display"], "Nairobi Doorstep")
        self.assertEqual(payload["item_count"], 1)
        self.assertEqual(payload["items"][0]["product_title"], "Linen Shirt")

    def test_item_exposes_product_slug_for_buy_again(self):
        category = Category.objects.create(name="Shirts", slug="shirts")
        product = Product.objects.create(
            title="Linen Shirt",
            category=category,
            base_price=Decimal("2500.00"),
            stock_quantity=5,
        )
        OrderItem.objects.create(
            order=self.first_order,
            product=product,
            product_title="Linen Shirt",
            unit_price=Decimal("2500.00"),
            quantity=1,
        )
        self.client.force_authenticate(user=self.user)

        res = self.client.get("/api/v1/orders/")
        payload = res.data["results"][-1]  # oldest order carries the item
        self.assertEqual(payload["items"][0]["product_slug"], "linen-shirt")

        # Removing the product nulls the FK; the snapshot stays readable.
        product.delete()
        res = self.client.get("/api/v1/orders/")
        payload = res.data["results"][-1]
        self.assertIsNone(payload["items"][0]["product_slug"])
        self.assertEqual(payload["items"][0]["product_title"], "Linen Shirt")

    def test_paginates_with_standard_results_set(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/v1/orders/?page_size=1")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertIsNotNone(res.data["next"])


class AdminOrderConfirmTestCase(TestCase):
    """Staff sign-off: PROCESSING -> CONFIRMED + email. M-Pesa payment only
    marks the order PAID; this transition is what emails the customer."""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Denim", slug="denim")
        self.product = Product.objects.create(
            title="Selvedge Jeans",
            category=self.category,
            base_price=4000.00,
            stock_quantity=4,  # one unit already reserved for the order below
        )
        self.staff = User.objects.create_user(
            username="shop_manager",
            email="manager@example.com",
            password="Password123!",
            role=User.Role.STAFF,
        )
        self.customer = User.objects.create_user(
            username="confirm_buyer",
            email="confirm_buyer@example.com",
            password="Password123!",
        )
        self.order = Order.objects.create(
            user=self.customer,
            email=self.customer.email,
            phone_number="+254712345678",
            shipping_name="Jane Wanjiku",
            county="Nairobi",
            town="Kilimani",
            street_address="12 Riara Road",
            delivery_method="nairobi_doorstep",
            subtotal=Decimal("4000.00"),
            total_amount=Decimal("4000.00"),
            status=Order.Status.PROCESSING,
            payment_method=Order.PaymentMethod.M_PESA,
            payment_status=Order.PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            product_title="Selvedge Jeans",
            unit_price=Decimal("4000.00"),
            quantity=1,
        )
        self.url = f"/api/v1/admin/orders/{self.order.order_number}/"

    def patch(self, payload, user=None):
        self.client.force_authenticate(user=user or self.staff)
        return self.client.patch(self.url, payload, format="json")

    def test_confirming_paid_order_sends_confirmation_email(self):
        res = self.patch({"status": Order.Status.CONFIRMED})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.CONFIRMED)
        # The sign-off changes fulfillment state only, never payment state.
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.order.order_number, mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, [self.order.email])

    def test_confirm_email_fires_only_on_transition(self):
        # Re-saving at the same status must not re-email the customer.
        self.patch({"status": Order.Status.CONFIRMED})
        res = self.patch({"status": Order.Status.CONFIRMED})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

    def test_non_confirm_status_change_sends_no_confirmation_email(self):
        res = self.patch({"status": Order.Status.DELIVERED})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.DELIVERED)
        self.assertEqual(len(mail.outbox), 0)

    def test_cancelling_from_dashboard_restores_stock(self):
        res = self.patch({"status": Order.Status.CANCELLED})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.CANCELLED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 5)
        # Cancelling is not the confirmation event - no confirm email.
        self.assertEqual(len(mail.outbox), 0)

    def test_customer_cannot_update_order_status(self):
        res = self.patch({"status": Order.Status.CONFIRMED}, user=self.customer)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PROCESSING)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_status_rejected(self):
        res = self.patch({"status": "SHIPPED"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PROCESSING)


class CouponCheckoutTestCase(TestCase):
    """Coupons at checkout: the maths is server-side, guests included."""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Jeans", slug="jeans")
        self.product = Product.objects.create(
            title="Wide-Leg Jeans",
            category=self.category,
            base_price=3000.00,
            stock_quantity=10,
        )
        self.cart = Cart.objects.create()
        CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)
        self.percent = Coupon.objects.create(
            code="welcome10",
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal("10"),
        )
        self.fixed = Coupon.objects.create(
            code="TAKE500",
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal("500"),
        )
        self.paused = Coupon.objects.create(
            code="PAUSED",
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal("50"),
            is_active=False,
        )
        self.payload = {
            "email": "shopper@example.com",
            "phone_number": "+254712345678",
            "full_name": "Jane Wanjiku",
            "county": "Nairobi",
            "town": "Kilimani",
            "street_address": "12 Riara Road",
            "payment_method": "cod",
        }

    def checkout(self, coupon_code=None, cart=None):
        payload = dict(self.payload)
        if coupon_code is not None:
            payload["coupon_code"] = coupon_code
        cart_id = str((cart or self.cart).id)
        return self.client.post(
            "/api/v1/orders/checkout/",
            payload,
            format="json",
            **{"HTTP_X_CART_ID": cart_id},
        )

    def test_percent_coupon_reduces_the_total(self):
        res = self.checkout("welcome10")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # 2 x 3000 = 6000 subtotal; 10% comes off the goods, not delivery.
        self.assertEqual(Decimal(str(res.data["subtotal"])), Decimal("6000.00"))
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("600.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("5400.00"))
        self.assertEqual(res.data["coupon_code"], "WELCOME10")

    def test_fixed_coupon_subtracts_its_amount(self):
        res = self.checkout("TAKE500")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("500.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("5500.00"))

    def test_code_matching_is_case_insensitive_and_normalised(self):
        # Codes are stored uppercase; shoppers may type them any which way.
        res = self.checkout("WeLcOmE10")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(order_number=res.data["order_number"])
        self.assertEqual(order.coupon.code, "WELCOME10")

    def test_discount_never_exceeds_the_goods_total(self):
        Coupon.objects.create(
            code="HALFOFF",
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal("99999"),
        )
        res = self.checkout("HALFOFF")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("6000.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("0.00"))

    def test_invalid_or_inactive_code_rejects_the_whole_order(self):
        for code in ("NOPE", "PAUSED"):
            res = self.checkout(code)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("coupon_code", res.data)
        # Nothing was ordered and no stock was committed.
        self.assertEqual(Order.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10)

    def test_checkout_without_a_coupon_is_unaffected(self):
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("0.00"))
        self.assertIsNone(res.data["coupon_code"])
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("6000.00"))

    def test_deleting_a_coupon_keeps_past_orders_intact(self):
        res = self.checkout("TAKE500")
        order = Order.objects.get(order_number=res.data["order_number"])

        self.fixed.delete()

        order.refresh_from_db()
        self.assertIsNone(order.coupon)
        self.assertEqual(order.discount_amount, Decimal("500.00"))
        self.assertEqual(order.total_amount, Decimal("5500.00"))

    @staticmethod
    def make_auto(code, percent, audience=Coupon.Audience.EVERYONE, **kwargs):
        return Coupon.objects.create(
            code=code,
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal(str(percent)),
            audience=audience,
            auto_apply=True,
            **kwargs,
        )

    def test_auto_coupon_applies_without_a_code(self):
        self.make_auto("AUTO10", "10")
        # The payload deliberately has no coupon_code key at all.
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["coupon_code"], "AUTO10")
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("600.00"))
        self.assertEqual(Decimal(str(res.data["total_amount"])), Decimal("5400.00"))

    def test_a_blank_code_opts_out_of_auto_apply(self):
        # The shopper saw the auto coupon and pressed Remove.
        self.make_auto("AUTO10", "10")
        res = self.checkout("")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["coupon_code"])
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("0.00"))

    def test_a_typed_code_beats_auto_apply(self):
        self.make_auto("AUTO10", "10")
        res = self.checkout("TAKE500")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["coupon_code"], "TAKE500")
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("500.00"))

    def test_the_largest_auto_discount_wins(self):
        self.make_auto("AUTO10", "10")  # worth 600 on this cart
        self.make_auto("AUTOFIVE", "5")  # worth 300
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["coupon_code"], "AUTO10")
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("600.00"))

    def test_inactive_auto_coupon_is_never_applied(self):
        self.make_auto("SLEEPING", "10", is_active=False)
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["coupon_code"])
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("0.00"))

    def test_guests_only_coupon_never_touches_signed_in_shoppers(self):
        self.make_auto("GUEST5", "5", audience=Coupon.Audience.GUESTS)
        # A guest cart gets it...
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["coupon_code"], "GUEST5")

        # ...an account holder neither auto-receives it nor may type it.
        shopper = User.objects.create_user(
            username="guestless",
            email="guestless@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        own_cart = Cart.objects.create(user=shopper)
        CartItem.objects.create(cart=own_cart, product=self.product, quantity=2)
        self.client.force_authenticate(user=shopper)

        # Typing it is refused outright; the 400 rolls back the cart too.
        res = self.checkout("GUEST5", cart=own_cart)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("coupon_code", res.data)

        # ...and without a code it simply stays off the order.
        res = self.checkout(cart=own_cart)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["coupon_code"])

    def test_first_order_coupon_ignores_returning_customers(self):
        self.make_auto(
            "FIRST10", "10", audience=Coupon.Audience.FIRST_ORDER
        )
        returning = User.objects.create_user(
            username="returning",
            email="returning@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        Order.objects.create(
            user=returning,
            guest_id="",
            email=returning.email,
            phone_number="+254712345678",
            shipping_name="Returning Shopper",
            county="Nairobi",
            town="Kilimani",
            street_address="12 Riara Road",
            subtotal=Decimal("2500.00"),
            total_amount=Decimal("2500.00"),
        )
        seen_cart = Cart.objects.create(user=returning)
        CartItem.objects.create(cart=seen_cart, product=self.product, quantity=2)
        self.client.force_authenticate(user=returning)
        res = self.checkout(cart=seen_cart)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["coupon_code"])

        # A brand-new account qualifies...
        newbie = User.objects.create_user(
            username="newbie",
            email="newbie@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        fresh_cart = Cart.objects.create(user=newbie)
        CartItem.objects.create(cart=fresh_cart, product=self.product, quantity=2)
        self.client.force_authenticate(user=newbie)
        res = self.checkout(cart=fresh_cart)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["coupon_code"], "FIRST10")

        # ...and so does a guest cart, whose history we cannot know.
        self.client.force_authenticate(user=None)
        res = self.checkout()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["coupon_code"], "FIRST10")


class CouponValidateAPITestCase(TestCase):
    """The checkout preview: dry-run a code against the current cart."""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Jeans", slug="jeans")
        self.product = Product.objects.create(
            title="Wide-Leg Jeans",
            category=self.category,
            base_price=3000.00,
            stock_quantity=10,
        )
        self.cart = Cart.objects.create()
        CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)
        self.coupon = Coupon.objects.create(
            code="TAKE500",
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal("500"),
        )
        Coupon.objects.create(
            code="PAUSED",
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal("10"),
            is_active=False,
        )

    def validate(self, code, cart=None):
        return self.client.post(
            "/api/v1/orders/coupons/validate/",
            {"code": code},
            format="json",
            **{"HTTP_X_CART_ID": str((cart or self.cart).id)},
        )

    def test_valid_code_returns_the_cart_discount(self):
        res = self.validate("take500")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["code"], "TAKE500")
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("500.00"))
        self.assertEqual(Decimal(str(res.data["cart_subtotal"])), Decimal("6000.00"))

    def test_unknown_or_inactive_code_is_rejected(self):
        self.assertEqual(self.validate("NOPE").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.validate("PAUSED").status_code, status.HTTP_400_BAD_REQUEST)

    def test_guest_cart_id_is_all_that_is_needed(self):
        # No signed-in user anywhere, exactly how guest checkout calls it.
        res = self.client.post(
            "/api/v1/orders/coupons/validate/",
            {"code": "TAKE500"},
            format="json",
            **{"HTTP_X_CART_ID": str(self.cart.id)},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_discount_on_an_empty_cart_is_zero(self):
        empty = Cart.objects.create()
        res = self.validate("TAKE500", cart=empty)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("0.00"))

    def auto_validate(self, cart=None):
        return self.client.post(
            "/api/v1/orders/coupons/validate/",
            {},
            format="json",
            **{"HTTP_X_CART_ID": str((cart or self.cart).id)},
        )

    def test_no_code_previews_the_auto_applying_coupon(self):
        Coupon.objects.create(
            code="AUTO10",
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal("10"),
            auto_apply=True,
        )
        res = self.auto_validate()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["code"], "AUTO10")
        self.assertTrue(res.data["auto_applied"])
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("600.00"))
        self.assertEqual(Decimal(str(res.data["cart_subtotal"])), Decimal("6000.00"))

    def test_no_auto_coupon_returns_a_null_code(self):
        res = self.auto_validate()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["code"])
        self.assertIsNone(res.data["discount_type"])
        self.assertTrue(res.data["auto_applied"])
        self.assertEqual(Decimal(str(res.data["discount_amount"])), Decimal("0.00"))

    def test_typed_codes_report_auto_applied_false(self):
        res = self.validate("take500")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["auto_applied"])

    def test_audience_ineligibility_reads_like_an_unknown_code(self):
        Coupon.objects.create(
            code="GUESTONLY",
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal("5"),
            audience=Coupon.Audience.GUESTS,
        )
        shopper = User.objects.create_user(
            username="no_guests",
            email="no_guests@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        self.client.force_authenticate(user=shopper)
        res = self.validate("GUESTONLY")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class AdminCouponAPITestCase(TestCase):
    """Staff manage coupons from the dashboard."""

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="coupon_manager",
            email="coupons@example.com",
            password="Password123!",
            role=User.Role.STAFF,
        )
        self.customer = User.objects.create_user(
            username="coupon_buyer",
            email="coupon_buyer@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        self.used = Coupon.objects.create(
            code="TAKE500",
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal("500"),
        )
        self.list_url = "/api/v1/admin/orders/coupons/"

    def test_customer_cannot_manage_coupons(self):
        self.client.force_authenticate(user=self.customer)
        self.assertIn(
            self.client.get(self.list_url).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        res = self.client.post(
            self.list_url,
            {"code": "NOPE", "discount_type": "percent", "discount_value": "10"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_creates_a_normalised_percent_coupon(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            self.list_url,
            {"code": " welcome10 ", "discount_type": "percent", "discount_value": "10"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["code"], "WELCOME10")
        self.assertTrue(res.data["is_active"])
        self.assertEqual(res.data["order_count"], 0)

    def test_coupon_values_are_policed(self):
        self.client.force_authenticate(user=self.staff)
        for payload in (
            {"code": "OVER", "discount_type": "percent", "discount_value": "150"},
            {"code": "ZERO", "discount_type": "fixed", "discount_value": "0"},
            {"code": "NEG", "discount_type": "fixed", "discount_value": "-5"},
        ):
            res = self.client.post(self.list_url, payload, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, payload)

    def test_duplicate_codes_are_rejected(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            self.list_url,
            {"code": "take500", "discount_type": "fixed", "discount_value": "500"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_toggle_is_active(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.patch(
            f"{self.list_url}{self.used.id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.used.refresh_from_db()
        self.assertFalse(self.used.is_active)

    def test_list_reports_order_counts(self):
        Order.objects.create(
            user=self.customer,
            email=self.customer.email,
            phone_number="+254712345678",
            shipping_name="Coupon Buyer",
            county="Nairobi",
            town="Kilimani",
            street_address="12 Riara Road",
            subtotal=Decimal("6000.00"),
            coupon=self.used,
            discount_amount=Decimal("500.00"),
            total_amount=Decimal("5500.00"),
        )
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = next(r for r in res.data["results"] if r["id"] == self.used.id)
        self.assertEqual(row["order_count"], 1)

    def test_delete_coupon(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.delete(f"{self.list_url}{self.used.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Coupon.objects.filter(id=self.used.id).exists())

    def test_audience_and_auto_apply_round_trip(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            self.list_url,
            {
                "code": "WELCOME20",
                "discount_type": "percent",
                "discount_value": "20",
                "audience": "first_order",
                "auto_apply": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["audience"], "first_order")
        self.assertTrue(res.data["auto_apply"])

        patched = self.client.patch(
            f"{self.list_url}{res.data['id']}/",
            {"auto_apply": False, "audience": "everyone"},
            format="json",
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertFalse(patched.data["auto_apply"])
        self.assertEqual(patched.data["audience"], "everyone")

    def test_audience_and_auto_apply_default_to_the_widest_reach(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            self.list_url,
            {"code": "PLAIN", "discount_type": "fixed", "discount_value": "100"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["audience"], "everyone")
        self.assertFalse(res.data["auto_apply"])

    def test_an_unknown_audience_is_rejected(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            self.list_url,
            {
                "code": "ALIENS",
                "discount_type": "percent",
                "discount_value": "10",
                "audience": "aliens",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class CancelStaleOrdersTestCase(TestCase):
    """Unpaid M-Pesa orders must not hold stock forever; the command cancels
    stale ones and restocks via Order.cancel()."""

    def setUp(self):
        self.category = Category.objects.create(name="Denim", slug="denim")
        self.product = Product.objects.create(
            title="Stale Jeans",
            category=self.category,
            base_price=Decimal("2000.00"),
            stock_quantity=5,
        )

    def _order(
        self,
        minutes_old=0,
        payment_method=Order.PaymentMethod.M_PESA,
        payment_status=Order.PaymentStatus.PENDING,
        status=Order.Status.PROCESSING,
    ):
        order = Order.objects.create(
            email="shopper@example.com",
            phone_number="0712345678",
            shipping_name="Jane Doe",
            county="Nairobi",
            town="Westlands",
            street_address="Mpaka Rd",
            total_amount=Decimal("4000.00"),
            payment_method=payment_method,
            payment_status=payment_status,
            status=status,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_title=self.product.title,
            unit_price=Decimal("2000.00"),
            quantity=2,
        )
        if minutes_old:
            Order.objects.filter(pk=order.pk).update(
                created_at=timezone.now() - timedelta(minutes=minutes_old)
            )
        return order

    def test_stale_unpaid_mpesa_order_is_cancelled_and_restocked(self):
        order = self._order(minutes_old=45)
        call_command("cancel_stale_orders")
        order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(self.product.stock_quantity, 7)  # 5 + 2 restored

    def test_recent_order_is_left_alone(self):
        order = self._order(minutes_old=5)
        call_command("cancel_stale_orders")
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PROCESSING)

    def test_in_flight_payment_is_skipped(self):
        """A fresh PENDING transaction means the shopper may still be paying."""
        order = self._order(minutes_old=45)
        PaymentTransaction.objects.create(
            order=order,
            merchant_request_id="MR1",
            checkout_request_id="ws_CO_STALE_1",
            amount=order.total_amount,
            phone_number="254712345678",
            status=PaymentTransaction.Status.PENDING,
        )
        call_command("cancel_stale_orders")
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PROCESSING)

    def test_paid_and_manually_confirmed_orders_are_left_alone(self):
        paid = self._order(
            minutes_old=120, payment_status=Order.PaymentStatus.PAID
        )
        confirmed = self._order(
            minutes_old=120, status=Order.Status.CONFIRMED
        )
        call_command("cancel_stale_orders")
        paid.refresh_from_db()
        confirmed.refresh_from_db()
        self.assertEqual(paid.status, Order.Status.PROCESSING)
        self.assertEqual(paid.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(confirmed.status, Order.Status.CONFIRMED)

    def test_cod_left_alone_unless_explicitly_included(self):
        cod = self._order(minutes_old=120, payment_method=Order.PaymentMethod.COD)
        call_command("cancel_stale_orders")
        cod.refresh_from_db()
        self.assertEqual(cod.status, Order.Status.PROCESSING)

        call_command("cancel_stale_orders", "--include-cod", "--cod-minutes", "60")
        cod.refresh_from_db()
        self.assertEqual(cod.status, Order.Status.CANCELLED)

    def test_dry_run_changes_nothing(self):
        order = self._order(minutes_old=45)
        call_command("cancel_stale_orders", "--dry-run")
        order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PROCESSING)
        self.assertEqual(self.product.stock_quantity, 5)
