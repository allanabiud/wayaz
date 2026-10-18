from unittest.mock import patch

from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, TestCase
from drf_spectacular.views import SpectacularAPIView
from rest_framework.test import APIClient

from accounts.models import User


class HealthEndpointTestCase(TestCase):
    """GET /api/health/ is the uptime monitor's target: 200 when the DB
    answers, 503 when it doesn't (so monitors alert on real outages)."""

    def setUp(self):
        self.client = APIClient()

    def test_health_ok(self):
        res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "ok")
        self.assertEqual(res.data["database"], "ok")
        self.assertIn("time", res.data)

    def test_health_aliases(self):
        """Monitors probing /health (with or without slash) get the same 200."""
        for path in ("/health", "/health/"):
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.data["status"], "ok")

    def test_health_unhealthy_when_database_down(self):
        with patch("config.views.connection") as mock_connection:
            mock_connection.cursor.side_effect = RuntimeError("db down")
            res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.data["status"], "unhealthy")


class DocumentationSecurityTestCase(TestCase):
    """Schema and interactive docs must be protected behind staff auth."""

    def setUp(self):
        self.client = APIClient()
        self.factory = RequestFactory()

    def test_schema_view_requires_staff_authentication(self):
        """Anonymous access to SpectacularAPIView is rejected with 401."""
        req = self.factory.get("/api/v1/schema/")
        req.user = AnonymousUser()
        view = SpectacularAPIView.as_view()
        res = view(req)
        self.assertEqual(res.status_code, 401)

    def test_schema_view_allows_staff_user(self):
        """Staff user can access SpectacularAPIView with 200."""
        req = self.factory.get("/api/v1/schema/", HTTP_HOST="localhost")
        staff = User(email="admin@example.com", is_staff=True, is_active=True)
        req.user = staff
        view = SpectacularAPIView.as_view()
        res = view(req)
        self.assertEqual(res.status_code, 200)

    def test_docs_endpoints_unmapped_or_protected(self):
        """Live HTTP requests to docs routes either 404 (unmapped in prod) or 401 (protected)."""
        for path in (
            "/api/v1/schema/",
            "/api/v1/schema/swagger-ui/",
            "/api/v1/schema/redoc/",
        ):
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertIn(res.status_code, (401, 403, 404))
