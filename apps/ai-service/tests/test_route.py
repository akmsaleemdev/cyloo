"""AI service tests — deterministic fallback path (no provider keys needed)."""
import pytest
from fastapi.testclient import TestClient
from app.main import Provider, app

client = TestClient(app)
SERVICE_HEADERS = {"Authorization": "Bearer test-service-token"}


@pytest.fixture(autouse=True)
def service_auth_token(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_AUTH_TOKEN", "test-service-token")


def test_health_reports_providers_honestly():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["providers_configured"], list)


def test_route_without_keys_uses_declared_fallback():
    res = client.post("/v1/agents/route", headers=SERVICE_HEADERS, json={
        "tenant_id": "12345678-1234-1234-1234-123456789012",
        "agent_kind": "support",
        "messages": [{"role": "user", "content": "مرحبا، أحتاج مساعدة"}],
        "language": "ar",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "deterministic-fallback"
    assert body["degraded"] is True
    assert "deterministic-fallback" in body["reply"]


def test_route_validates_payload():
    res = client.post("/v1/agents/route", headers=SERVICE_HEADERS, json={"tenant_id": "short", "messages": []})
    assert res.status_code == 422  # pydantic validation, stable error shape


def test_route_awaits_configured_provider(monkeypatch):
    class TestProvider(Provider):
        name = "test-provider"

        async def complete(self, messages, max_tokens):
            return "provider response", "test-model"

    monkeypatch.setattr("app.main.pick_provider", lambda: TestProvider())
    res = client.post("/v1/agents/route", headers=SERVICE_HEADERS, json={
        "tenant_id": "12345678-1234-1234-1234-123456789012",
        "messages": [{"role": "user", "content": "Hello"}],
    })

    assert res.status_code == 200
    assert res.json()["reply"] == "provider response"
    assert res.json()["provider"] == "test-provider"


def test_route_rejects_missing_or_invalid_service_credentials():
    payload = {
        "tenant_id": "12345678-1234-1234-1234-123456789012",
        "messages": [{"role": "user", "content": "Hello"}],
    }
    assert client.post("/v1/agents/route", json=payload).status_code == 401
    assert client.post(
        "/v1/agents/route",
        headers={"Authorization": "Bearer wrong-token"},
        json=payload,
    ).status_code == 401


def test_route_fails_closed_when_service_auth_is_unconfigured(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_AUTH_TOKEN")
    res = client.post("/v1/agents/route", headers=SERVICE_HEADERS, json={
        "tenant_id": "12345678-1234-1234-1234-123456789012",
        "messages": [{"role": "user", "content": "Hello"}],
    })
    assert res.status_code == 503
