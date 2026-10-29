# syntax=docker/dockerfile:1

# The official Playwright image ships Chromium and every system library it needs.
# Its version must match the "playwright" dependency in apps/api/package.json.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble

# ---- dependencies (cached until a package.json or the lockfile changes) ----
FROM ${PLAYWRIGHT_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build the web app and the API ----
FROM deps AS build
COPY apps ./apps
RUN npm run build

# ---- production dependencies only ----
FROM ${PLAYWRIGHT_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace=@scriptbench/api --no-audit --no-fund

# ---- runtime ----
FROM ${PLAYWRIGHT_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Scripts run as the unprivileged pwuser that the Playwright image provides.
RUN mkdir -p /data && chown -R pwuser:pwuser /data
USER pwuser
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
