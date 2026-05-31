# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production

FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
# Next.js imports some API routes while collecting build data. Use non-production
# placeholders here; real values are injected into the runtime container.
ARG NEXT_PUBLIC_TIANDITU_KEY
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-placeholder-secret \
    AWS_REGION=us-east-1 \
    NEXT_PUBLIC_TIANDITU_KEY=$NEXT_PUBLIC_TIANDITU_KEY
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
