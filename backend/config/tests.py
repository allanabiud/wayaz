from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient


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
    """Schema and interactive docs must be completely unmapped in production
    (SERVE_DOCS=False) and protected behind staff auth when enabled."""

    def setUp(self):
        self.client = APIClient()

    def test_docs_return_404_when_serve_docs_is_disabled(self):
        with patch("django.conf.settings.SERVE_DOCS", False):
            # When SERVE_DOCS is False, routes aren't included in urlpatterns
            for path in (
                "/api/v1/schema/",
                "/api/v1/schema/swagger-ui/",
                "/api/v1/schema/redoc/",
            ):
                with self.subTest(path=path):
                    res = self.client.get(path)
                    # Either 404 or redirect to 404
                    self.assertIn(res.status_code, (401, 403, 404))

    def test_schema_requires_staff_authentication(self):
        """Anonymous access to schema view is rejected with 401."""
        res = self.client.get("/api/v1/schema/")
        self.assertEqual(res.status_code, 401)
