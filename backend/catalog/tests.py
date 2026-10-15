from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

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
        response = self.client.get(
            f"/api/v1/catalog/products/?category={self.category.slug}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)

    def test_category_list_exposes_icon(self):
        self.category.icon = "jeans"
        self.category.save(update_fields=["icon"])
        response = self.client.get("/api/v1/catalog/categories/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        jeans = next(category for category in results if category["slug"] == "jeans")
        self.assertEqual(jeans["icon"], "jeans")

    def test_search_suggestions_api(self):
        response = self.client.get(
            "/api/v1/catalog/products/search-suggestions/?q=Vintage"
        )
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
        self.assertIn(
            post.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )
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
        ProductReview.objects.create(product=self.product, user=self.alice, rating=4)

        anon = self.client.get(f"/api/v1/catalog/products/{self.product.slug}/")
        self.assertEqual(anon.status_code, status.HTTP_200_OK)
        self.assertEqual(anon.data["average_rating"], 4.0)
        self.assertEqual(anon.data["rating_count"], 1)
        self.assertIsNone(anon.data["user_rating"])

        self.client.force_authenticate(self.alice)
        as_owner = self.client.get(f"/api/v1/catalog/products/{self.product.slug}/")
        self.assertEqual(as_owner.data["user_rating"], 4)

    def list_url(self):
        return f"/api/v1/catalog/products/{self.product.slug}/reviews/"

    def test_review_list_returns_comments_and_flags_own_review(self):
        self.client.force_authenticate(self.alice)
        self.client.post(
            self.review_url(),
            {"rating": 5, "comment": "Great fit"},
            format="json",
        )
        self.client.force_authenticate(self.bob)
        self.client.post(
            self.review_url(),
            {"rating": 2, "comment": "Too tight"},
            format="json",
        )

        res = self.client.get(self.list_url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)
        rows = {row["reviewer"]: row for row in res.data["results"]}
        self.assertEqual(rows["alice"]["comment"], "Great fit")
        self.assertEqual(rows["alice"]["rating"], 5)
        # Own review is flagged so the PDP can re-open it for editing.
        self.assertTrue(rows["bob"]["mine"])
        self.assertFalse(rows["alice"]["mine"])

    def test_anonymous_review_list_never_flags_mine(self):
        ProductReview.objects.create(
            product=self.product, user=self.alice, rating=4, comment="Lovely"
        )
        res = self.client.get(self.list_url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["reviewer"], "alice")
        self.assertFalse(res.data["results"][0]["mine"])

    def test_rating_only_post_preserves_the_written_comment(self):
        # Quick-star sends just {rating}; it must never wipe written feedback.
        self.client.force_authenticate(self.alice)
        self.client.post(
            self.review_url(),
            {"rating": 5, "comment": "Great fit"},
            format="json",
        )
        res = self.client.post(self.review_url(), {"rating": 4}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        review = ProductReview.objects.get(user=self.alice, product=self.product)
        self.assertEqual(review.rating, 4)
        self.assertEqual(review.comment, "Great fit")

        # An explicitly empty comment still clears it.
        self.client.post(self.review_url(), {"rating": 4, "comment": ""}, format="json")
        review.refresh_from_db()
        self.assertEqual(review.comment, "")

    def test_new_reviews_publish_immediately(self):
        self.client.force_authenticate(self.alice)
        self.client.post(
            self.review_url(), {"rating": 5, "comment": "Nice"}, format="json"
        )
        review = ProductReview.objects.get(user=self.alice, product=self.product)
        self.assertTrue(review.is_approved)

    def test_hidden_reviews_leave_the_public_views(self):
        ProductReview.objects.create(
            product=self.product, user=self.alice, rating=5, comment="Spam"
        )
        ProductReview.objects.create(
            product=self.product,
            user=self.bob,
            rating=1,
            comment="Hidden rant",
            is_approved=False,
        )

        # The aggregate counts approved reviews only...
        res = self.client.get(self.review_url())
        self.assertEqual(res.data["rating_count"], 1)
        self.assertEqual(res.data["average_rating"], 5.0)

        listing = self.client.get(self.list_url())
        self.assertEqual(listing.data["count"], 1)
        self.assertEqual(listing.data["results"][0]["comment"], "Spam")


class ProductPriceFilterTestCase(TestCase):
    """min_price / max_price / ordering work off the price actually charged
    (sale price while a sale is live), not the pre-sale sticker price."""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Denim", slug="denim")
        # Costs 4,200 today; the sticker says 5,000.
        self.on_sale = Product.objects.create(
            title="On Sale Jean",
            category=self.category,
            base_price=5000.00,
            sale_price=4200.00,
            stock_quantity=5,
        )

    def list(self, query):
        response = self.client.get(f"/api/v1/catalog/products/?{query}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data.get("results", response.data)

    def test_max_price_accepts_the_sale_price(self):
        # 4,200 fits the budget even though the sticker price does not.
        results = self.list("max_price=4500")
        self.assertEqual([p["id"] for p in results], [self.on_sale.id])

    def test_max_price_still_hides_pricier_items(self):
        self.assertEqual(self.list("max_price=4000"), [])

    def test_min_price_uses_the_sale_price(self):
        # Its 4,200 sale price sits below the floor, so it drops out.
        self.assertEqual(self.list("min_price=4300"), [])
        self.assertEqual(len(self.list("min_price=4100")), 1)

    def test_non_numeric_price_is_ignored(self):
        # Garbage in the query string must not blow up the listing.
        self.assertEqual(len(self.list("min_price=free")), 1)

    def test_price_sort_ignores_the_sticker_price(self):
        # Current prices: Cheap Sale 2,500 / Plain 4,000 / On Sale 4,200.
        Product.objects.create(
            title="Cheap Sale Jean",
            category=self.category,
            base_price=5000.00,
            sale_price=2500.00,
            stock_quantity=5,
        )
        Product.objects.create(
            title="Plain Jean",
            category=self.category,
            base_price=4000.00,
            stock_quantity=5,
        )

        titles = [p["title"] for p in self.list("ordering=price_asc")]
        self.assertEqual(
            titles,
            ["Cheap Sale Jean", "Plain Jean", "On Sale Jean"],
        )

        titles = [p["title"] for p in self.list("ordering=price_desc")]
        self.assertEqual(
            titles,
            ["On Sale Jean", "Plain Jean", "Cheap Sale Jean"],
        )


class SeedShopGuardTestCase(TestCase):
    """Demo data must never land on a real database by accident."""

    def test_seeding_refuses_to_run_with_debug_off(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        from django.test import override_settings

        with override_settings(DEBUG=False), self.assertRaises(CommandError):
            call_command("seed", "shop")


class StoreSettingsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff_user = get_user_model().objects.create_user(
            username="staff_user",
            email="staff@wayaz.co.ke",
            password="password123",
            is_staff=True,
        )
        self.customer = get_user_model().objects.create_user(
            username="customer_user",
            email="cust@wayaz.co.ke",
            password="password123",
        )

    def test_public_settings_accessible_unauthenticated(self):
        res = self.client.get("/api/v1/catalog/settings/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["store_name"], "Wayaz Collection")
        self.assertIn("whatsapp_number", res.data)
        self.assertIn("instagram_url", res.data)

    def test_admin_settings_forbidden_for_customers(self):
        self.client.force_authenticate(self.customer)
        res = self.client.get("/api/v1/admin/settings/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_settings_update(self):
        self.client.force_authenticate(self.staff_user)
        payload = {
            "store_name": "Wayaz Boutique",
            "whatsapp_number": "254711223344",
            "instagram_url": "https://instagram.com/wayazboutique",
            "announcement_text": "Flash sale this weekend!",
            "is_announcement_active": True,
        }
        res = self.client.patch("/api/v1/admin/settings/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["store_name"], "Wayaz Boutique")
        self.assertEqual(res.data["whatsapp_number"], "254711223344")
        self.assertEqual(res.data["announcement_text"], "Flash sale this weekend!")
        self.assertTrue(res.data["is_announcement_active"])

        self.client.logout()
        pub_res = self.client.get("/api/v1/catalog/settings/")
        self.assertEqual(pub_res.data["store_name"], "Wayaz Boutique")
        self.assertEqual(pub_res.data["whatsapp_number"], "254711223344")

    def test_admin_settings_support_phones_validation_and_update(self):
        self.client.force_authenticate(self.staff_user)
        valid_phones = [
            {"label": "Sales", "number": "+254712345678"},
            {"label": "Support", "number": "0722000000"},
        ]
        res = self.client.patch(
            "/api/v1/admin/settings/",
            {"support_phones": valid_phones},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["support_phones"]), 2)
        self.assertEqual(res.data["support_phones"][0]["label"], "Sales")

        pub_res = self.client.get("/api/v1/catalog/settings/")
        self.assertEqual(len(pub_res.data["support_phones"]), 2)

        invalid_res = self.client.patch(
            "/api/v1/admin/settings/",
            {"support_phones": [{"label": "Help", "number": "abc"}]},
            format="json",
        )
        self.assertEqual(invalid_res.status_code, status.HTTP_400_BAD_REQUEST)


class AdminProductImageUploadTestCase(TestCase):
    """Upload validation: real images only, allowlisted extensions, capped
    size, typed metadata."""

    UPLOAD_URL = "/api/v1/admin/products/{pid}/upload-image/"

    def setUp(self):
        self.client = APIClient()

    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username="img_staff",
            email="img@wayaz.co.ke",
            password="password123",
            is_staff=True,
        )
        cls.customer = get_user_model().objects.create_user(
            username="img_customer",
            email="imgcust@wayaz.co.ke",
            password="password123",
        )
        category = Category.objects.create(name="Tops", slug="tops")
        cls.product = Product.objects.create(
            title="Test Tee",
            category=category,
            base_price=Decimal("1500.00"),
            stock_quantity=10,
        )

    @staticmethod
    def _image_bytes(fmt, size=64):
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (size, size), (200, 30, 30)).save(buf, fmt)
        return buf.getvalue()

    def upload(self, name, content, content_type, extra=None):
        self.client.force_authenticate(self.staff)
        data = {
            "image": SimpleUploadedFile(name, content, content_type),
            **(extra or {}),
        }
        return self.client.post(
            self.UPLOAD_URL.format(pid=self.product.id), data, format="multipart"
        )

    def test_valid_jpeg_upload_succeeds(self):
        res = self.upload(
            "tee.jpg",
            self._image_bytes("JPEG"),
            "image/jpeg",
            {"display_order": "2", "is_primary": "true"},
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["display_order"], 2)
        self.assertTrue(res.data["is_primary"])
        self.assertEqual(self.product.images.count(), 1)

    def test_display_order_garbage_is_a_400_not_a_crash(self):
        res = self.upload(
            "tee.png",
            self._image_bytes("PNG"),
            "image/png",
            {"display_order": "not-a-number"},
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_disallowed_extension_rejected(self):
        # A real GIF - valid image, but outside the allowlist.
        res = self.upload("anim.gif", self._image_bytes("GIF"), "image/gif")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.product.images.count(), 0)

    def test_fake_image_content_rejected(self):
        # A ".jpg" that is really plain text: Pillow must refuse it.
        res = self.upload("fake.jpg", b"definitely not an image at all", "image/jpeg")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversized_image_rejected(self):
        import io
        import os

        from PIL import Image

        # Noise JPEGs barely compress, so this lands well over the 5MB cap.
        img = Image.frombytes("RGB", (2400, 2400), os.urandom(2400 * 2400 * 3))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=100)
        self.assertGreater(len(buf.getvalue()), 5 * 1024 * 1024)

        res = self.upload("huge.jpg", buf.getvalue(), "image/jpeg")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("5MB", str(res.data))

    def test_upload_forbidden_for_customers(self):
        self.client.force_authenticate(self.customer)
        res = self.client.post(
            self.UPLOAD_URL.format(pid=self.product.id), {}, format="multipart"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ContactMessageTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff_user = get_user_model().objects.create_user(
            username="contact_staff",
            email="staff@wayaz.co.ke",
            password="password123",
            is_staff=True,
        )
        self.customer = get_user_model().objects.create_user(
            username="contact_cust",
            email="cust@wayaz.co.ke",
            password="password123",
        )

    def test_public_contact_submission(self):
        payload = {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "phone": "+254712345678",
            "subject": "Delivery Question",
            "message": "Do you deliver to Westlands?",
        }
        res = self.client.post("/api/v1/catalog/contact/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["name"], "Jane Doe")
        self.assertEqual(res.data["subject"], "Delivery Question")

        from catalog.models import ContactMessage

        msg = ContactMessage.objects.get(id=res.data["id"])
        self.assertFalse(msg.is_read)

    def test_admin_contact_messages_list_and_manage(self):
        from catalog.models import ContactMessage

        msg = ContactMessage.objects.create(
            name="Alice",
            email="alice@example.com",
            subject="Size inquiry",
            message="What is the size chart for jeans?",
        )

        # Unauthenticated cannot access admin
        res = self.client.get("/api/v1/admin/contact-messages/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.customer)
        res = self.client.get("/api/v1/admin/contact-messages/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.staff_user)
        res = self.client.get("/api/v1/admin/contact-messages/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data["results"]), 1)

        nav_res = self.client.get("/api/v1/admin/nav-counts/")
        self.assertEqual(nav_res.status_code, status.HTTP_200_OK)
        self.assertIn("messages", nav_res.data)
        self.assertEqual(nav_res.data["messages"], 1)

        patch_res = self.client.patch(
            f"/api/v1/admin/contact-messages/{msg.id}/",
            {"is_read": True},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertTrue(patch_res.data["is_read"])
        msg.refresh_from_db()
        self.assertTrue(msg.is_read)

        del_res = self.client.delete(f"/api/v1/admin/contact-messages/{msg.id}/")
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ContactMessage.objects.filter(id=msg.id).exists())


class RestockNotificationTestCase(TestCase):
    # The view throttles on its own throttle_classes, so clear the shared
    # cache here to keep this class off whatever other cases already spent.
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.client = APIClient()
        self.category = Category.objects.create(name="Dresses", slug="dresses")
        self.product = Product.objects.create(
            title="Ankara Wrap Dress",
            category=self.category,
            base_price=Decimal("3500.00"),
            stock_quantity=0,
            sizes=["S", "M"],
        )
        self.in_stock = Product.objects.create(
            title="Linen Shirt",
            category=self.category,
            base_price=Decimal("2000.00"),
            stock_quantity=8,
        )
        self.url = "/api/v1/catalog/restock-notifications/"

    def test_subscribe_when_out_of_stock(self):
        res = self.client.post(
            self.url,
            {"product": self.product.id, "email": "Shopper@Example.com "},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        from catalog.models import RestockNotification

        note = RestockNotification.objects.get(product=self.product)
        # Stored lowercase so "Shopper@" and "shopper@" are one subscription.
        self.assertEqual(note.email, "shopper@example.com")
        self.assertFalse(note.is_notified)

    def test_resubscribing_is_not_an_error(self):
        payload = {"product": self.product.id, "email": "shopper@example.com"}
        self.client.post(self.url, payload, format="json")
        again = self.client.post(self.url, payload, format="json")
        self.assertEqual(again.status_code, status.HTTP_200_OK)

        from catalog.models import RestockNotification

        # Still exactly one row - the unique constraint is doing its job.
        self.assertEqual(
            RestockNotification.objects.filter(product=self.product).count(), 1
        )

    def test_rejects_subscribe_on_an_in_stock_piece(self):
        res = self.client.post(
            self.url,
            {"product": self.in_stock.id, "email": "shopper@example.com"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res.data)

    def test_rejects_bad_email(self):
        res = self.client.post(
            self.url, {"product": self.product.id, "email": "nope"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res.data)
