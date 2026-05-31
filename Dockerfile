# syntax=docker/dockerfile:1

# ---- Base: pnpm via corepack ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# ---- Build: full deps + compile to dist/ ----
FROM base AS build
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts skips the husky `prepare` hook (no .git in image); the build
# only needs tsc, not native modules.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

# ---- Prod deps only (with compiled native bcrypt) ----
FROM base AS prod-deps
# native build tools for bcrypt
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
  && pnpm rebuild bcrypt

# ---- Runtime: slim, non-root ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
