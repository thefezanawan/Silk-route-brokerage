# ---- build deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json server.js ./
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "server.js"]
