FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY public ./public
RUN bun run copy-wasm
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/index.ts"]
