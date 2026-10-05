from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from catalog.models import Category, Product

User = get_user_model()


class AccountsAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="shiquo_fan",
            email="shiquo@example.com",
            password="StrongPassword123!",
            first_name="Jane",
            last_name="Doe",
            phone_number="+254712345678",
        )

        self.category = Category.objects.create(name="Beauty", slug="beauty")
        self.product = Product.objects.create(
            title="Hydrating Glow Serum",
            slug="hydrating-glow-serum",
            category=self.category,
            base_price=3000.00,
        )

    def test_user_registration(self):
        payload = {
            "username": "new_customer",
            "email": "customer@example.com",
            "password": "CustomerPassword123!",
            "first_name": "Allan",
            "last_name": "Smith",
            "phone_number": "+254798765432",
        }
        response = self.client.post("/api/v1/auth/register/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="new_customer").exists())

    def test_jwt_token_obtain(self):
        payload = {
            "username": "shiquo_fan",
            "password": "StrongPassword123!",
        }
        response = self.client.post("/api/v1/auth/token/", payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "shiquo@example.com")

    def test_user_profile_authenticated(self):
        # Authenticate via credentials
        token_res = self.client.post(
            "/api/v1/auth/token/",
            {"username": "shiquo_fan", "password": "StrongPassword123!"},
        )
        token = token_res.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "shiquo_fan")
        self.assertEqual(response.data["phone_number"], "+254712345678")

    def test_address_crud(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            "full_name": "Jane Doe",
            "phone_number": "+254712345678",
            "county": "Nairobi",
            "town": "Westlands",
            "street_address": "Parklands Rd, House 4B",
            "is_default": True,
        }
        response = self.client.post("/api/v1/auth/addresses/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["county"], "Nairobi")

    def test_wishlist_add_and_remove(self):
        self.client.force_authenticate(user=self.user)
        # Add to wishlist
        response = self.client.post(
            "/api/v1/auth/wishlist/", {"product_id": self.product.id}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # List wishlist
        list_res = self.client.get("/api/v1/auth/wishlist/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data.get("results", list_res.data)), 1)

        # Remove from wishlist by product_id
        del_res = self.client.delete(
            f"/api/v1/auth/wishlist/remove-product/{self.product.id}/"
        )
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
