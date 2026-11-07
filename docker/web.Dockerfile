# GCC-CRM Web (Next.js standalone) — for AWS ECS/Amplify-custom deployments.
# Build from repo root:  docker build -f apps/web/Dockerfile <repo-root>
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w packages/shared && npm run build -w apps/web

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
WORKDIR /srv
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s \
  CMD wget -qO- http://127.0.0.1:3000/dashboard >/dev/null 2>&1 || exit 1
CMD ["node", "apps/web/server.js"]
