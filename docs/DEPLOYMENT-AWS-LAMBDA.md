# Lambda deployment variant — decision + step-by-step runbook

> Complements docs/DEPLOYMENT-AWS.md (ECS). Both run the SAME NestJS app —
> Lambda via the AWS Lambda Web Adapter container. Pick per workload:
> **Lambda for spiky/low traffic and webhooks; ECS for steady volume.**

## 1. Decision matrix (honest)

| Workload | Lambda fit | Why |
|---|---|---|
| REST API (CRUD) | ✅ excellent | stateless; pay-per-request; scales to zero |
| **Webhook ingest** (WhatsApp/payments) | ✅ ideal | bursty, must ack fast — Lambda's strongest case |
| AI gateway calls (I/O bound ≤30s) | ✅ fine | 29s timeout covers provider calls; response streaming supported |
| **Inline background processing** | ⛔ must move | `void this.queue.processWithRetry(...)` and the in-process workflow executor DIE on Lambda freeze — this is why ADR-0008 kept the queue seam |
| BullMQ workers | ⛔ anti-pattern | BullMQ needs persistent Redis connections → use **SQS consumers** (Lambda) or keep Fargate workers |
| Inbox realtime/streaming | 🔶 | polling fine; SSE works via response streaming; Realtime moves to Supabase at cutover |

**Net effect on this codebase: exactly one code-level cutover** (flagged by
`QUEUE_MODE=sqs`, already a documented environment variable):
1. `WebhookController.ingest` — replace the inline
   `await this.queue.processWithRetry(...)` with an
   `SQS SendMessage` into `gcc-crm-inbox` (~15 lines, aws-sdk v3, only loaded
   when `QUEUE_MODE=sqs`), keeping the identical durable-persist → dedupe →
   enqueue order (ack before processing).
2. The SQS processor Lambda reuses the SAME image with `WORKER_ENTRY=inbox`
   and calls the API's own idempotent processor — the dedupe key
   `(source, account_ref, event_id)` in `webhook_events` guarantees
   at-least-once stays safe.
3. Workflow events: emit → SQS `gcc-crm-automation` instead of the in-process
   bus (the `onDomainEvent` seam accepts a queue-backed dispatcher).

## 2. Prerequisites
- Docker (image build), AWS CLI v2, an ECR repo (`gcc-crm/api`) — the ECS
  runbook §4 applies unchanged; or `terraform apply` the bootstrap in
  `infrastructure/terraform/main.tf`.

## 3. Build the Lambda image
```bash
cd enterprise-crm
docker build -f docker/api-lambda.Dockerfile -t gcc-crm/api:lambda .
aws ecr get-login-password --region me-central-1 | docker login --username AWS --password-stdin <acct>.dkr.ecr.me-central-1.amazonaws.com
docker tag gcc-crm/api:lambda <acct>.dkr.ecr.me-central-1.amazonaws.com/gcc-crm/api:lambda
docker push <acct>.dkr.ecr.me-central-1.amazonaws.com/gcc-crm/api:lambda
```
The image embeds the **AWS Lambda Web Adapter** (`docker/api-lambda.Dockerfile`),
which proxies Lambda events to the app's HTTP port — **zero code change** for
the API surface.

## 4. Provision the stack
```bash
cd infrastructure/terraform
terraform init
terraform apply -var="api_image_uri=<acct>.dkr.ecr.me-central-1.amazonaws.com/gcc-crm/api:lambda" \
                -var="web_origin=https://app.yourdomain.ae"
terraform output api_url     # → https://<id>.lambda-url.me-central-1.on.aws
```
`lambda.tf` creates: `gcc-crm-api` Lambda (arm64, 1024 MB), Function URL,
`gcc-crm-inbox` SQS + DLQ (maxReceiveCount 3 = ADR-0008 retries), and the
`inbox-processor` Lambda with `ReportBatchItemFailures`.

## 5. Wire providers
Point WhatsApp/Meta/payments webhooks at the Function URL (or an ALB in front
for a custom domain + ACM):
```
https://<id>.lambda-url.me-central-1.on.aws/api/v1/webhooks/whatsapp
https://<id>.lambda-url.me-central-1.on.aws/api/v1/payments/webhook
```

## 6. Cold-start budget
- NestJS boots 15 modules; measure with `AWS_LWA_READINESS_CHECK_PATH=/api/docs`
  (already set). Expect ~1–2 s cold on arm64.
- Mitigations if it matters: provisioned concurrency (2–5) on the API
  function; move Swagger setup behind `NODE_ENV !== 'production'` (one-line);
  minify by splitting route bundles later if ever needed.

## 7. Costs (rule-of-thumb, us-east equivalent pricing in me-central-1 ±10%)
| Traffic | Lambda | ECS Fargate (2×0.5/1GB) |
|---|---|---|
| ~50k req/mo | ~$1–3 | ~$35 flat |
| ~1M req/mo | ~$25–45 | ~$35 |
| ~10M req/mo | ~$250+ (with provisioned concurrency) | ~$60–90 (autoscaled) |
**Verdict**: Lambda wins under ~1M req/mo and for webhook burst absorption;
ECS wins at steady high volume. Hybrid is normal: API on Lambda, DLQ replay +
scheduled sweeps on ECS, or all-Lambda with SQS.

## 8. Verification + rollback
- [ ] `curl -s https://<function-url>/api/docs | head -c 200` → Swagger HTML
- [ ] POST a web-chat webhook event → conversation created; SQS depth returns
      to 0; DLQ empty
- [ ] Kill the processor (throttle) → messages return to queue → DLQ after 3
- [ ] Rollback = repoint the ALB/Route53 to the ECS service (both stacks can
      run in parallel against one database during migration)
