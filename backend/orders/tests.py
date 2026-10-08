from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from catalog.models import Category, Product
from orders.models import Cart, CartItem

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

