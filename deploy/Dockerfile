# API-only experimental server. Build from the repository root.
FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json VENDOR.lock ./
COPY packages ./packages
COPY vendor ./vendor
COPY scripts/vendor.mjs ./scripts/vendor.mjs
RUN npm ci --ignore-scripts --omit=dev --no-fund
RUN node scripts/vendor.mjs install
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "packages/server/bin/qv-server.ts"]
CMD ["--config", "/etc/quietvote/server.json"]
