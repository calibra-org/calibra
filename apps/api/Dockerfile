FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY toolings/typescript/package.json ./toolings/typescript/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /repo /repo
COPY . .
WORKDIR /repo/apps/api
RUN pnpm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 adonis

COPY --from=builder --chown=adonis:nodejs /repo/apps/api/build ./build
COPY --from=builder --chown=adonis:nodejs /repo/apps/api/node_modules ./node_modules
COPY --from=builder --chown=adonis:nodejs /repo/apps/api/package.json ./

USER adonis
EXPOSE 3333

CMD ["node", "build/bin/server.js"]
