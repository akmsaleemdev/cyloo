# GCC-CRM API (NestJS) — production image.
# Build from the repository root:
#   docker build -f docker/api.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund \
 && npm run build -w packages/shared \
 && npm run build -w @crm/integrations \
 && npm run build -w @crm/api \
 && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3001
RUN addgroup -S app && adduser -S app -G app
WORKDIR /srv
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=app:app /app/packages/shared/dist-cjs ./packages/shared/dist-cjs
COPY --from=build --chown=app:app /app/packages/integrations/package.json ./packages/integrations/package.json
COPY --from=build --chown=app:app /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=build --chown=app:app /app/packages/integrations/dist-cjs ./packages/integrations/dist-cjs
COPY --from=build --chown=app:app /app/apps/api/dist ./dist
COPY --from=build --chown=app:app /app/apps/api/package.json ./package.json
USER app
EXPOSE 3001
# Public, auth-free endpoint suitable for ALB/healthchecks:
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3001/api/docs >/dev/null 2>&1 || exit 1
CMD ["node", "dist/main.js"]
