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

    def test_health_unhealthy_when_database_down(self):
        with patch("config.views.connection") as mock_connection:
            mock_connection.cursor.side_effect = RuntimeError("db down")
            res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.data["status"], "unhealthy")
