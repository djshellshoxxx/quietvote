# API-only experimental server. Build from the repository root.
FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --ignore-scripts --omit=dev --no-fund
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "packages/server/bin/qv-server.ts"]
CMD ["--config", "/etc/quietvote/server.json"]
