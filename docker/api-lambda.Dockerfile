# GCC-CRM API — LAMBDA variant (AWS Lambda Web Adapter).
# The SAME NestJS app, no code change: the adapter proxies Lambda events to
# the container's HTTP port. Build from repo root:
#   docker build -f docker/api-lambda.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/integrations/package*.json ./packages/integrations/
COPY apps/api/package*.json ./apps/api/
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY packages/shared ./packages/shared
COPY packages/integrations ./packages/integrations
COPY apps/api ./apps/api
RUN npm run build -w @crm/shared && npm run build -w @crm/integrations \
 && npm run build -w @crm/api && npm prune --omit=dev || true

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3001
# AWS Lambda Web Adapter: copies the Rust binary in and rewires the entrypoint.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-web-adapter /opt/extensions/lambda-web-adapter
ENV AWS_LWA_INVOKE_MODE=response-stream \
    AWS_LWA_READINESS_CHECK_PATH=/api/docs \
    AWS_LWA_PORT=3001
RUN addgroup -S app && adduser -S app -G app
WORKDIR /srv
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/dist-cjs ./packages/shared/dist-cjs
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=build /app/packages/integrations/dist-cjs ./packages/integrations/dist-cjs
COPY --from=build /app/packages/integrations/package.json ./packages/integrations/package.json
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
USER app
EXPOSE 3001
CMD ["node", "dist/main.js"]
