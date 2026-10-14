"""Uptime-monitoring endpoint: GET /api/health/. Checks the database with a
real query so a broken pool or lost container shows up as 503, not a lying 200."""

from django.db import connection
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:  # noqa: BLE001 - any DB failure means unhealthy
            return Response(
                {"status": "unhealthy", "database": "error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "status": "ok",
                "database": "ok",
                "time": timezone.now().isoformat(),
            }
        )
