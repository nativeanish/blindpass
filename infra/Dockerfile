FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
COPY --chown=node:node . .
USER node
RUN pnpm install --frozen-lockfile
RUN mkdir -p /app/.secrets

FROM base AS api
USER node
EXPOSE 3001
CMD ["sh", "-c", "pnpm db:migrate && exec pnpm start:api"]

FROM base AS web
ENV API_INTERNAL_URL=http://api:3001
RUN pnpm build
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@blindpass/web", "start"]
