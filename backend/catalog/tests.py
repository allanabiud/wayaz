from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from catalog.models import Category, Product


class CatalogAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.category = Category.objects.create(
            name="Jeans",
            slug="jeans",
            description="Denim jeans",
            display_order=1,
        )

        self.product = Product.objects.create(
            title="Vintage Washed Wide-Leg Jeans",
            category=self.category,
            description="Premium wide-leg denim",
            base_price=5000.00,
            sale_price=4200.00,
            stock_quantity=10,
        )

    def test_product_properties(self):
        self.assertTrue(self.product.is_on_sale)
        self.assertEqual(self.product.current_price, 4200.00)
        self.assertEqual(self.product.total_stock, 10)
        self.assertTrue(self.product.is_in_stock)

    def test_out_of_stock_product(self):
        empty = Product.objects.create(
            title="Sold Out Jeans",
            category=self.category,
            base_price=3000.00,
            stock_quantity=0,
        )
        self.assertFalse(empty.is_in_stock)
        self.assertEqual(empty.total_stock, 0)

    def test_list_products_api(self):
        response = self.client.get("/api/v1/catalog/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertGreaterEqual(len(results), 1)
        first_product = results[0]
        self.assertEqual(first_product["title"], "Vintage Washed Wide-Leg Jeans")
        self.assertTrue(first_product["is_in_stock"])

    def test_retrieve_product_detail_api(self):
        response = self.client.get(f"/api/v1/catalog/products/{self.product.slug}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data["slug"], self.product.slug)
        self.assertEqual(data["stock_quantity"], 10)
        self.assertEqual(data["category"]["name"], "Jeans")

    def test_filter_products_by_category(self):
        response = self.client.get(f"/api/v1/catalog/products/?category={self.category.slug}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)

    def test_search_suggestions_api(self):
        response = self.client.get("/api/v1/catalog/products/search-suggestions/?q=Vintage")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("products", response.data)
        self.assertIn("categories", response.data)
        matching_products = response.data["products"]
        self.assertGreaterEqual(len(matching_products), 1)
        self.assertEqual(matching_products[0]["title"], "Vintage Washed Wide-Leg Jeans")

