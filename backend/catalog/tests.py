from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from catalog.models import Category, Product, ProductReview


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


class ProductReviewAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Shirts", slug="shirts")
        self.product = Product.objects.create(
            title="Oxford Shirt",
            category=self.category,
            base_price=2500.00,
            stock_quantity=5,
        )
        self.alice = get_user_model().objects.create_user(
            username="alice", email="alice@example.com", password="Password123!"
        )
        self.bob = get_user_model().objects.create_user(
            username="bob", email="bob@example.com", password="Password123!"
        )

    def review_url(self):
        return f"/api/v1/catalog/products/{self.product.slug}/review/"

    def test_anonymous_can_read_but_not_rate(self):
        res = self.client.get(self.review_url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["average_rating"])
        self.assertEqual(res.data["rating_count"], 0)
        self.assertIsNone(res.data["user_rating"])

        post = self.client.post(self.review_url(), {"rating": 5}, format="json")
        self.assertIn(post.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertEqual(ProductReview.objects.count(), 0)

    def test_submitting_and_aggregating_ratings(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(self.review_url(), {"rating": 5}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user_rating"], 5)
        self.assertEqual(res.data["rating_count"], 1)
        self.assertEqual(res.data["average_rating"], 5.0)

        self.client.force_authenticate(self.bob)
        res = self.client.post(self.review_url(), {"rating": 3}, format="json")
        self.assertEqual(res.data["user_rating"], 3)
        self.assertEqual(res.data["rating_count"], 2)
        self.assertEqual(res.data["average_rating"], 4.0)

        # Re-rating overwrites instead of duplicating
        self.client.force_authenticate(self.alice)
        res = self.client.post(self.review_url(), {"rating": 4}, format="json")
        self.assertEqual(res.data["user_rating"], 4)
        self.assertEqual(res.data["rating_count"], 2)
        self.assertEqual(res.data["average_rating"], 3.5)
        self.assertEqual(ProductReview.objects.count(), 2)

    def test_invalid_rating_rejected(self):
        self.client.force_authenticate(self.alice)
        for bad in (0, 6):
            res = self.client.post(self.review_url(), {"rating": bad}, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ProductReview.objects.count(), 0)

    def test_detail_response_carries_rating_summary(self):
        ProductReview.objects.create(
            product=self.product, user=self.alice, rating=4
        )

        anon = self.client.get(f"/api/v1/catalog/products/{self.product.slug}/")
        self.assertEqual(anon.status_code, status.HTTP_200_OK)
        self.assertEqual(anon.data["average_rating"], 4.0)
        self.assertEqual(anon.data["rating_count"], 1)
        self.assertIsNone(anon.data["user_rating"])

        self.client.force_authenticate(self.alice)
        as_owner = self.client.get(
            f"/api/v1/catalog/products/{self.product.slug}/"
        )
        self.assertEqual(as_owner.data["user_rating"], 4)
