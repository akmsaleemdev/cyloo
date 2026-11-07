# GCC-CRM bootstrap infrastructure — real, applyable resources for the
# foundation the ECS runbook (docs/DEPLOYMENT-AWS.md) builds on:
# ECR repos, CloudWatch log groups, SNS alert topic, and the GitHub OIDC
# deploy role. ECS/ALB/RDS live in later modules; this file is the base.
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

variable "github_org_repo" {
  description = "GitHub OIDC trust subject: <org>/<repo>"
  type        = string
}

provider "aws" {
  region = var.aws_region
}

# ---------- Container registry (immutable tags, scan on push) ----------
resource "aws_ecr_repository" "api" {
  name                 = "gcc-crm/api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_repository" "web" {
  name                 = "gcc-crm/web"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_repository" "ai" {
  name                 = "gcc-crm/ai"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

# ---------- Logs (90-day retention, per service) ----------
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/gcc-crm-api"
  retention_in_days = 90
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/gcc-crm-worker"
  retention_in_days = 90
}

resource "aws_cloudwatch_log_group" "ai" {
  name              = "/ecs/gcc-crm-ai"
  retention_in_days = 90
}

# ---------- Alerting ----------
resource "aws_sns_topic" "alerts" {
  name = "gcc-crm-alerts"
}

# ---------- GitHub Actions OIDC deploy role (no stored AWS keys) ----------
data "tls_certificate" "gh" {
  url = "https://token.actions.githubusercontent.com/.well-known/jwks"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.gh.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "gh_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_org_repo}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "gcc-crm-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.gh_trust.json
}

data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability", "ecr:PutImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = ["*"]
  }
  statement {
    actions   = ["ecs:UpdateService", "ecs:DescribeServices", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:Wait"]
    resources = ["*"]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::*:role/gcc-crm-ecs-*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

output "ecr_api_url"   { value = aws_ecr_repository.api.repository_url }
output "ecr_web_url"   { value = aws_ecr_repository.web.repository_url }
output "ecr_ai_url"    { value = aws_ecr_repository.ai.repository_url }
output "deploy_role"   { value = aws_iam_role.github_deploy.arn }
output "alerts_topic"  { value = aws_sns_topic.alerts.arn }
