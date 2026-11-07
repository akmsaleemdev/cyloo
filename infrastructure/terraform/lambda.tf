# Lambda-first queue infrastructure (alternative to ECS workers).
# SQS replaces BullMQ ingestion: the API acks webhooks fast and enqueues;
# Lambda consumers process with the same idempotency guarantees (ADR-0008).
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
}

variable "aws_region" {
  type    = string
  default = "me-central-1"
}

variable "api_image_uri" {
  description = "${account}.dkr.ecr.<region>.amazonaws.com/gcc-crm/api:<tag>"
  type        = string
}

variable "web_origin" {
  type = string
}

provider "aws" {
  region = var.aws_region
}

# ---------- Queues (main + DLQ per ADR-0008 semantics) ----------
resource "aws_sqs_queue" "inbox_dlq" {
  name                      = "gcc-crm-inbox-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "inbox" {
  name                       = "gcc-crm-inbox"
  visibility_timeout_seconds = 120   # > worst-case processing time
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.inbox_dlq.arn
    maxReceiveCount     = 3           # bounded retries → DLQ (ADR-0008)
  })
}

resource "aws_sqs_queue" "automation" {
  name                       = "gcc-crm-automation"
  visibility_timeout_seconds = 180
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.inbox_dlq.arn
    maxReceiveCount     = 3
  })
}

# ---------- API Lambda (container image via Web Adapter) ----------
resource "aws_lambda_function" "api" {
  function_name = "gcc-crm-api"
  package_type  = "Image"
  image_uri     = var.api_image_uri
  memory_size   = 1024
  timeout       = 29                # headroom under the 30s ALB budget
  architectures = ["arm64"]         # Graviton: ~20% cheaper, same codebase

  environment {
    variables = {
      NODE_ENV   = "production"
      QUEUE_MODE = "sqs"             # cutover flag: ingest enqueues instead of inline-processing
      WEB_ORIGIN = var.web_origin
    }
  }
}

# Function URL (simplest) — or attach to the ALB target group instead.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"       # public; auth handled inside the app (guard)
  cors {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["authorization", "content-type", "x-signature", "x-widget-key", "x-csrf-token"]
  }
}

# ---------- Event source: SQS → processor Lambda ----------
resource "aws_lambda_function" "inbox_processor" {
  function_name = "gcc-crm-inbox-processor"
  package_type  = "Image"
  image_uri     = var.api_image_uri   # same image; WORKER_ENTRY selects the handler
  memory_size   = 512
  timeout       = 120
  architectures = ["arm64"]
  environment {
    variables = {
      NODE_ENV     = "production"
      WORKER_ENTRY = "inbox"            # entrypoint reads this to run the processor loop
      QUEUE_MODE   = "sqs"
    }
  }
}

resource "aws_lambda_event_source_mapping" "inbox" {
  event_source_arn        = aws_sqs_queue.inbox.arn
  function_name           = aws_lambda_function.inbox_processor.arn
  batch_size              = 10
  maximum_retry_attempts  = 3          # → DLQ (maxReceiveCount) per ADR-0008
  function_response_types = ["ReportBatchItemFailures"]
}

output "api_url" {
  value = aws_lambda_function_url.api.function_url
}

output "queues" {
  value = {
    inbox      = aws_sqs_queue.inbox.url
    automation = aws_sqs_queue.automation.url
    dlq        = aws_sqs_queue.inbox_dlq.arn
  }
}
