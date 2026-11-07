# ai-service — FastAPI model gateway (ADR-0009 boundary)

Providers: OpenAI implemented via httpx; Anthropic/Bedrock/Vertex plug into
the same `Provider` protocol. No keys → declared deterministic fallback
(never a faked answer). Governance (permissions, approvals, budgets) lives at
the tool layer in apps/api.

```bash
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8100     # /health, POST /v1/agents/route
pytest                                # fallback + validation tests
```

Build the production container from the repository root:

```bash
docker build -f docker/ai-service.Dockerfile -t cyloo-ai-service .
docker run --rm -p 8100:8100 cyloo-ai-service
```

For AWS, publish this image to ECR and run it as a private ECS/Fargate service.
Pass provider credentials through AWS Secrets Manager only; the image contains
no keys. The service currently supports OpenAI and a deterministic fallback.
