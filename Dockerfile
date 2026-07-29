FROM node:22-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm exec next build --webpack

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY --from=builder /app ./
RUN pnpm prune --prod

USER node
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0"]
