"""Automated tests for the /api/v1/health/ endpoint and CORS setup."""

from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class HealthCheckAPITestCase(APITestCase):
    def setUp(self) -> None:
        self.url = reverse("api-v1-health")

    def test_health_endpoint_url_is_versioned(self) -> None:
        self.assertEqual(self.url, "/api/v1/health/")

    def test_health_endpoint_returns_200_without_authentication(self) -> None:
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["service"], "pos-backend")
        self.assertEqual(response.data["api_version"], "v1")
        self.assertEqual(response.data["database"], "connected")
        self.assertIn("timestamp", response.data)

    @patch("apps.core.views.get_health_status")
    def test_health_endpoint_returns_503_when_database_unavailable(self, mock_health) -> None:
        mock_health.return_value = (
            {
                "status": "degraded",
                "service": "pos-backend",
                "api_version": "v1",
                "database": "unavailable",
                "timestamp": "2026-11-23T00:00:00+00:00",
            },
            False,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["status"], "degraded")
        self.assertEqual(response.data["database"], "unavailable")

    @override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
    def test_health_endpoint_returns_cors_header_for_allowed_origin(self) -> None:
        response = self.client.get(self.url, HTTP_ORIGIN="http://localhost:5173")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Access-Control-Allow-Origin"],
            "http://localhost:5173",
        )

    @override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
    def test_health_endpoint_omits_cors_header_for_disallowed_origin(self) -> None:
        response = self.client.get(self.url, HTTP_ORIGIN="http://evil.example.com")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("Access-Control-Allow-Origin", response)
