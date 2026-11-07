#!/usr/bin/env bash
# Build & push API, web, and AI-service images to ECR. Run from the repo root.
# Prereqs: AWS CLI v2 configured, docker running, variables set below.
set -euo pipefail
AWS_REGION="${AWS_REGION:-me-central-1}"
AWS_ACCOUNT="${AWS_ACCOUNT:?set AWS_ACCOUNT}"
REPO_API="${REPO_API:-gcc-crm/api}"
REPO_WEB="${REPO_WEB:-gcc-crm/web}"
REPO_AI="${REPO_AI:-gcc-crm/ai}"
TAG="${TAG:-$(git rev-parse --short HEAD)}"

registry="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry"

for repo in "$REPO_API" "$REPO_WEB" "$REPO_AI"; do
  aws ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" >/dev/null 2>&1 || \
    aws ecr create-repository --repository-name "$repo" --region "$AWS_REGION" \
      --image-scanning-configuration scanOnPush=true --image-tag-mutability IMMUTABLE
done

docker build -f docker/api.Dockerfile -t "$registry/$REPO_API:$TAG" .
docker push "$registry/$REPO_API:$TAG"
docker build -f docker/web.Dockerfile -t "$registry/$REPO_WEB:$TAG" .
docker push "$registry/$REPO_WEB:$TAG"
docker build -f docker/ai-service.Dockerfile -t "$registry/$REPO_AI:$TAG" .
docker push "$registry/$REPO_AI:$TAG"
echo "Pushed API, web, and AI images with tag $TAG to $registry"
