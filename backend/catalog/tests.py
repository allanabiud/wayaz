from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from catalog.models import Category, Brand, Product, ProductVariant


class CatalogAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.category = Category.objects.create(
            name="Audio & Electronics",
            description="All audio gear",
            is_featured=True,
            display_order=1,
        )

        self.brand = Brand.objects.create(
            name="Apex Sound",
            is_featured=True,
        )

        self.product = Product.objects.create(
            title="Apex Pro Wireless Earbuds",
            category=self.category,
            brand=self.brand,
            description="Premium earbuds with ANC",
            base_price=5000.00,
            sale_price=4200.00,
            is_featured=True,
            is_trending=True,
        )

        self.variant_black = ProductVariant.objects.create(
            product=self.product,
            sku="APX-EAR-BLK",
            color_name="Phantom Black",
            color_hex="#000000",
            size="One Size",
            stock_quantity=10,
        )

        self.variant_white = ProductVariant.objects.create(
            product=self.product,
            sku="APX-EAR-WHT",
            color_name="Pearl White",
            color_hex="#FFFFFF",
            size="One Size",
            stock_quantity=0,
        )

    def test_product_properties(self):
        self.assertTrue(self.product.is_on_sale)
        self.assertEqual(self.product.current_price, 4200.00)
        self.assertEqual(self.product.total_stock, 10)
        self.assertTrue(self.product.is_in_stock)
        self.assertTrue(self.variant_black.is_in_stock)
        self.assertFalse(self.variant_white.is_in_stock)

    def test_list_products_api(self):
        response = self.client.get("/api/v1/catalog/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertGreaterEqual(len(results), 1)
        first_product = results[0]
        self.assertEqual(first_product["title"], "Apex Pro Wireless Earbuds")
        self.assertEqual(len(first_product["available_colors"]), 2)

    def test_retrieve_product_detail_api(self):
        response = self.client.get(f"/api/v1/catalog/products/{self.product.slug}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data["slug"], self.product.slug)
        self.assertEqual(len(data["variants"]), 2)
        self.assertEqual(data["category"]["name"], "Audio & Electronics")

    def test_filter_products_by_category(self):
        response = self.client.get(f"/api/v1/catalog/products/?category={self.category.slug}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)

    def test_search_suggestions_api(self):
        response = self.client.get("/api/v1/catalog/products/search-suggestions/?q=Apex")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("products", response.data)
        self.assertIn("categories", response.data)
        matching_products = response.data["products"]
        self.assertGreaterEqual(len(matching_products), 1)
        self.assertEqual(matching_products[0]["title"], "Apex Pro Wireless Earbuds")
