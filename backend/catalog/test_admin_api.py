from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from catalog.models import Category, Brand, Product, ProductVariant

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
        self.brand = Brand.objects.create(name="Nike", slug="nike")

        self.product = Product.objects.create(
            title="Air Max 90",
            category=self.category,
            brand=self.brand,
            base_price=12000.00,
        )

        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="AM90-WHT-42",
            color_name="White",
            color_hex="#FFFFFF",
            size="42",
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
        self.assertEqual(res.data["kpis"]["total_products"], 1)
        self.assertEqual(len(res.data["low_stock_alerts"]), 1)

    def test_admin_create_product_with_variants(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "title": "Air Force 1",
            "category_id": self.category.id,
            "brand_id": self.brand.id,
            "description": "Classic all-white sneakers",
            "base_price": "9500.00",
            "is_featured": True,
            "variants": [
                {
                    "sku": "AF1-WHT-40",
                    "color_name": "Triple White",
                    "color_hex": "#FFFFFF",
                    "size": "40",
                    "stock_quantity": 15,
                },
                {
                    "sku": "AF1-WHT-41",
                    "color_name": "Triple White",
                    "color_hex": "#FFFFFF",
                    "size": "41",
                    "stock_quantity": 20,
                },
            ],
        }
        res = self.client.post("/api/v1/admin/products/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Product.objects.count(), 2)
        created_product = Product.objects.get(title="Air Force 1")
        self.assertEqual(created_product.variants.count(), 2)
        self.assertEqual(created_product.total_stock, 35)

    def test_admin_adjust_variant_stock(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f"/api/v1/admin/variants/{self.variant.id}/adjust-stock/"

        # Set absolute stock
        res = self.client.post(url, {"stock_quantity": 50}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 50)

        # Relative adjustment (+10)
        res = self.client.post(url, {"adjustment": 10}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 60)
