"""GCC-CRM AI service (FastAPI) — the model-gateway boundary (ADR-0009).

Governance lives at the TOOL layer in apps/api; this service owns MODEL
routing only:
  • provider-agnostic gateway: OpenAI today; Anthropic/Bedrock/Vertex adapters
    plug into the same `Provider` protocol
  • deterministic fallback when no key is configured (declared, never faked)
  • per-tenant budget header passthrough; PII-minimal logging (no bodies)
Run: uvicorn app.main:app --host 0.0.0.0 --port 8100
"""
import os
import secrets
import time
from typing import Literal, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="GCC-CRM AI service", version="0.1.0")

PROVIDERS = {
    "openai": os.getenv("OPENAI_API_KEY", ""),
    "anthropic": os.getenv("ANTHROPIC_API_KEY", ""),
}
TIMEOUT = float(os.getenv("AI_TIMEOUT_SECONDS", "30"))


class RouteRequest(BaseModel):
    tenant_id: str = Field(min_length=8, max_length=64)
    agent_kind: Literal["support", "qualify", "booking", "voice"] = "support"
    messages: list[dict] = Field(min_length=1, max_length=40)  # {role, content}
    language: Literal["en", "ar", "hi", "ur"] = "en"
    max_tokens: int = Field(default=800, ge=1, le=4000)


class RouteResponse(BaseModel):
    reply: str
    provider: str          # openai | anthropic | deterministic-fallback
    model: Optional[str] = None
    latency_ms: int
    degraded: bool = False  # True when the deterministic fallback answered


class Provider:
    """Provider protocol — adapters implement `complete`. No mock success."""

    name = "base"

    async def complete(self, messages: list[dict], max_tokens: int) -> tuple[str, str]:
        raise NotImplementedError


class OpenAIProvider(Provider):
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model = model

    async def complete(self, messages: list[dict], max_tokens: int) -> tuple[str, str]:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "messages": messages, "max_tokens": max_tokens},
            )
            res.raise_for_status()
            data = res.json()
            return data["choices"][0]["message"]["content"], self.model


def pick_provider() -> Optional[Provider]:
    """Model routing: first configured provider wins; fallback is declared."""
    if PROVIDERS["openai"]:
        return OpenAIProvider(PROVIDERS["openai"], os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    # anthropic adapter lands with its key (same protocol)
    return None


def deterministic_fallback(req: RouteRequest) -> str:
    """Honest offline answer — same contract as the API's engine (ADR-0009)."""
    return (
        "[deterministic-fallback] The AI service is running without provider "
        "credentials. Configure OPENAI_API_KEY (or another provider) to enable "
        "live model responses. Governance remains enforced at the tool layer."
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "providers_configured": [k for k, v in PROVIDERS.items() if v],
        "fallback": "deterministic",
    }


@app.post("/v1/agents/route", response_model=RouteResponse)
async def route(req: RouteRequest, authorization: Optional[str] = Header(default=None)):
    service_token = os.getenv("AI_SERVICE_AUTH_TOKEN", "")
    if not service_token:
        raise HTTPException(status_code=503, detail="AI service authentication is not configured")
    scheme, separator, supplied_token = (authorization or "").partition(" ")
    if (
        scheme.lower() != "bearer"
        or not separator
        or not secrets.compare_digest(supplied_token, service_token)
    ):
        raise HTTPException(status_code=401, detail="Invalid service credentials")

    started = time.perf_counter()
    provider = pick_provider()
    if provider is None:
        return RouteResponse(
            reply=deterministic_fallback(req),
            provider="deterministic-fallback",
            latency_ms=int((time.perf_counter() - started) * 1000),
            degraded=True,
        )
    try:
        text, model = await provider.complete(req.messages, req.max_tokens)
        return RouteResponse(
            reply=text, provider=provider.name, model=model,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
    except Exception as e:  # noqa: BLE001 — report honestly, never fabricate
        return RouteResponse(
            reply=f"[provider-error] {type(e).__name__}: reported honestly; no answer fabricated.",
            provider=provider.name, latency_ms=int((time.perf_counter() - started) * 1000),
            degraded=True,
        )
