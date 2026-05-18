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
RUN pnpm --filter=@calibra/api run build
RUN pnpm --filter=@calibra/api deploy --prod --legacy /prod/api
RUN cp -r apps/api/build/. /prod/api/

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 adonis

COPY --from=builder --chown=adonis:nodejs /prod/api ./

USER adonis
EXPOSE 3333

CMD ["node", "bin/server.js"]
