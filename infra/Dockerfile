FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
USER node
COPY --chown=node:node pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch --frozen-lockfile
COPY --chown=node:node . .
RUN pnpm install --offline --frozen-lockfile
RUN mkdir -p /app/.secrets

FROM base AS tools
CMD ["pnpm", "keys:generate"]

FROM base AS api
ENV NODE_ENV=production
USER node
EXPOSE 3001
HEALTHCHECK --interval=20s --timeout=12s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "pnpm db:migrate && exec pnpm start:api"]

FROM base AS web
ARG NEXT_PUBLIC_BLINDPASS_FINGERPRINT
ENV NEXT_PUBLIC_BLINDPASS_FINGERPRINT=$NEXT_PUBLIC_BLINDPASS_FINGERPRINT
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm build
ENV NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/app').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@blindpass/web", "start"]
