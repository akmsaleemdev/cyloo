# AWS deployment guide (ECS) — GCC-CRM

> Lambda-first alternative: see [DEPLOYMENT-AWS-LAMBDA.md](DEPLOYMENT-AWS-LAMBDA.md) — same app image, SQS-driven, cheaper under ~1M req/mo.

> Runbook for you to execute (I hold no AWS credentials — nothing here has
> been deployed; every command is exact and every verification is listed).
> Region default: `me-central-1` (Bahrain — closest to GCC users). Swap if
> your workloads demand a different region; record the choice for residency.

## Architecture
```
Route53 ──▶ ALB (ACM TLS) ──▶ ECS Fargate: gcc-crm/api (private subnets, 2 AZ)
                        └──▶ Amplify Hosting: apps/web (Next.js SSR)
ECS Fargate: gcc-crm/worker (BullMQ)  +  gcc-crm/ai (FastAPI container)
ElastiCache Redis (private)   ·   Supabase Postgres (me-central1) or RDS
Secrets Manager ◀── IAM task roles (no secrets in images/env files)
GitHub Actions ──OIDC──▶ AWS (ECR push + ECS deploy, keys never stored)
```

## 0. Prerequisites (once)
```bash
aws configure                                    # access key of an IAM admin WITH MFA enabled
aws sts get-caller-identity                      # verify account
# Enable IAM Access Analyzer + create a billing alarm FIRST:
aws budgets create-budget --account-id <ACCT> --budget \
  '{"BudgetName":"monthly-cap","BudgetLimit":{"Amount":"300","Unit":"USD"},"TimeUnit":"MONTHLY"}'
aws ce create-anomaly-detector ...               # optional but recommended
```

## 1. Network (VPC, 2 AZs, private workloads)
```bash
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query Vpc.VpcId --output text)
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ${REGION}a   # public-a
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ${REGION}b   # public-b
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.11.0/24 --availability-zone ${REGION}a  # private-a
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.12.0/24 --availability-zone ${REGION}b  # private-b
# IGW + NAT gateway (1 NAT is fine to start; 2 for AZ redundancy)
aws ec2 create-internet-gateway ...              # attach to VPC
aws ec2 allocate-address ... && aws ec2 create-nat-gateway ...  # in public-a
# Route tables: public→IGW, private→NAT
```
Security groups (least privilege):
- `sg-alb`: ingress 443 from 0.0.0.0/0
- `sg-api`: ingress 3001 **from sg-alb only**
- `sg-ai`: ingress 8100 **from sg-api only**; never expose the model gateway publicly
- `sg-redis`: ingress 6379 **from sg-api/sg-worker only**
- No DB SG publicly reachable — ever.

## 2. Data layer
**Postgres — decision**: stack mandate is Supabase (Auth + RLS + pgvector +
Storage). Create the project in `me-central1` per docs/SUPABASE-SETUP.md and
connect from ECS over the pooled 6543 endpoint. *If policy forces AWS-only*:
RDS Postgres 16 (Multi-AZ, private subnets) + Cognito + S3 replace it — the
app's `TenantStore` interface takes a `DATABASE_URL`, and the pgTAP RLS suite
runs unchanged against either.
**Redis**: ElastiCache serverless (or `cache.t4g.micro` to start), private
subnets, `REDIS_URL` rediss:// with AUTH token in Secrets Manager.

## 3. Secrets Manager + IAM roles (no secrets in images)
```bash
aws secretsmanager create-secret --name gcc-crm/DATABASE_URL \
  --secret-string "postgresql://user:pass@host:6543/postgres"    # repeat per key
```
Two roles:
- `gcc-crm-ecs-execution`: pull ECR + read the secrets above + write CloudWatch logs.
- `gcc-crm-ecs-task`: app identity — Secrets read ONLY for gcc-crm/*, S3
  access if used; attach `AmazonDynamoDB...` nothing else. Least privilege,
  reviewed with IAM Access Analyzer.
Attach to task definition (infrastructure/aws/taskdef-api.json already references them).

## 4. Container registry + images
```bash
AWS_ACCOUNT=<acct> AWS_REGION=me-central-1 bash infrastructure/aws/ecr-push.sh
```

The script builds and pushes API, web, and FastAPI AI images to their
immutable ECR repositories. Register the AI task definition from
`infrastructure/aws/taskdef-ai-service.json` after creating its log group and
task roles. The AI container runs without provider credentials using its
declared deterministic fallback; add provider keys only through Secrets
Manager when ready.
(Scan-on-push + IMMUTABLE tags are set by the script. Docker required — not
available in this environment, so the image build itself must run on a
Docker-enabled workstation or a configured CI runner.)

**Do not deploy the API image yet.** The API intentionally fails startup in
production until its PostgreSQL persistence adapter and Supabase Auth/JWT
membership resolution are implemented. The FastAPI AI container can run
independently, but production traffic must remain gated on its authentication
and authorization integration.

## 5. ECS cluster + service
```bash
aws ecs create-cluster --cluster-name gcc-crm \
  --capacity-providers FARGATE --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
aws logs create-log-group --log-group-name /ecs/gcc-crm-api
# Register the task definition (render placeholders first):
export $(grep -v '^#' infra/aws/taskdef-api.env | xargs)   # or use envsubst
envsubst < infrastructure/aws/taskdef-api.json > td.json
aws ecs register-task-definition --cli-input-json file://td.json
envsubst < infrastructure/aws/taskdef-ai-service.json > td-ai.json
aws ecs register-task-definition --cli-input-json file://td-ai.json
# Target group + ALB:
aws elbv2 create-target-group --name gcc-api --protocol HTTP --port 3001 \
  --vpc-id $VPC_ID --health-check-path /api/docs --health-check-interval-seconds 30 \
  --target-type ip
aws elbv2 create-load-balancer --name gcc-alb --subnets <public-a> <public-b> \
  --security-groups <sg-alb>
aws elbv2 create-listener --load-balancer-arn <alb> --protocol HTTPS --port 443 \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 --certificates CertificateArn=<acm> \
  --default-actions Type=forward,TargetGroupArn=<tg>
aws ecs create-service --cluster gcc-crm --service-name api --task-definition gcc-crm-api \
  --desired-count 2 --launch-type FARGATE --network-configuration 'awsvpcConfiguration={
    subnets=[private-a,private-b],securityGroups=[sg-api],assignPublicIp=DISABLED}' \
  --load-balancers targetGroupArn=<tg>,containerName=api,containerPort=3001 \
  --health-check-grace-period-seconds 30
# Run the AI service privately; allow only the API security group to reach port 8100.
aws ecs create-service --cluster gcc-crm --service-name ai --task-definition gcc-crm-ai \
  --desired-count 2 --launch-type FARGATE --network-configuration 'awsvpcConfiguration={
    subnets=[private-a,private-b],securityGroups=[sg-ai],assignPublicIp=DISABLED}'
# Autoscaling: target 60% CPU, min 2 max 10
aws application-autoscaling register-scalable-target --service-namespace ecs \
  --resource-id service/gcc-crm/api --min-capacity 2 --max-capacity 10 \
  --scalable-dimension ecs:service:DesiredCount
```

## 6. Web (Next.js)
**Recommended**: AWS Amplify Hosting → connect the GitHub repo → build spec:
```yaml
version: 1
frontend:
  phases:
    install: { commands: ['npm ci || npm install'] }
    build: { commands: ['npm run build -w packages/shared', 'npm run build -w apps/web'] }
  artifacts: { baseDirectory: apps/web/.next, files: ['**/*'] }
  cache: { paths: ['node_modules/**/*'] }
```
Environment: `NEXT_PUBLIC_API_URL=https://api.<domain>` (App settings → env
vars — browser-safe values only). Alternative for full control: the
`docker/web.Dockerfile` on the same ECS pattern as the API.

## 7. DNS + TLS
```bash
# ACM certificate FOR THE ALB must be requested in the same region as the ALB:
aws acm request-certificate --domain-name api.<domain> --validation-method DNS
# Add the CNAME validation record in Route53, then wait for ISSUED.
aws route53 change-resource-record-sets --hosted-zone-id <zone> --change-batch '{
  "Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"api.<domain>",
  "Type":"A","AliasTarget":{"HostedZoneId":<alb-zone-id>,"DNSName":<alb-dns>,
  "EvaluateTargetHealth":true}}}]}'   # HTTPS cert attaches to the ALB listener
```

## 8. Webhooks (providers → your ALB)
Register with each provider (once their credentials exist):
- WhatsApp: `https://api.<domain>/api/v1/webhooks/whatsapp` + verify token
- Payments (Stripe/GCC): `https://api.<domain>/api/v1/payments/webhook`
- Ads lead forms: authenticated ingest endpoint
The ALB idle timeout must exceed slow provider responses: set 60s. Requests
are stateless — ECS autoscaling handles bursts; the queue (Redis) absorbs
spikes for processing.

## 9. CI/CD (GitHub → AWS via OIDC, no stored keys)
```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com ...
aws iam create-role --role-name gcc-crm-github-deploy --assume-role-policy-document '{...trust: token.actions.githubusercontent.com:sub=repo:<org>/<repo>:ref:refs/heads/main...}'
aws iam attach-role-policy --role-name gcc-crm-github-deploy --policy-arn <policy with ECR push + ecs:UpdateService + iam:PassRole>
```
Then add repo secrets `AWS_ROLE_ARN`, `AWS_REGION`, `AWS_ACCOUNT` —
`.github/workflows/aws-deploy.yml` (already in repo) runs tests → builds →
pushes ECR → deploys ECS → **auto-rollback to the previous task revision on
instability**.

## 10. Observability & alarms
```bash
aws logs create-log-group --log-group-name /ecs/gcc-crm-api     # retention 90d
# CloudWatch alarms: ALB 5xx > 10 in 5min, target response time p95 > 2s,
# ECS CPU > 80%, memory > 80%, Redis evictions — SNS → email/Slack
```
Sentry DSNs for app-level error tracking (env reference).

## 11. Verification checklist (post-deploy)
- [ ] `curl -I https://api.<domain>/api/docs` → 200, HTTP/2, HSTS
- [ ] `curl -I https://app.<domain>` → 200 from Amplify
- [ ] ECS service shows 2/2 healthy targets; deployment circuit breaker ON
- [ ] Register a test webhook in the Platform UI → test-fire → delivery logged
- [ ] Rollback rehearsed: promote previous task revision, service stable
- [ ] Secrets audit: `aws secretsmanager list-secrets` matches env reference;
      task role policies pass Access Analyzer with no findings

## 12. Indicative monthly cost (small start)
| Item | Spec | ~USD/mo |
|---|---|---|
| ECS Fargate api | 2×0.5 vCPU/1GB | ~35 |
| ALB | 1 | ~20 |
| NAT gateway | 1 | ~35 |
| ElastiCache | t4g.micro | ~12 |
| Amplify web | build+serve | ~5–15 |
| Data transfer | low | ~10 |
| **Supabase** (DB/Auth) | Pro | ~25 |
Total ≈ **$140–170/mo** before AI/provider usage. Scale targets live in
docs/gcccrm; re-estimate after load tests on real infrastructure.
