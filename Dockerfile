# --- build frontend ---
FROM node:22-bookworm-slim AS webbuild
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# --- install backend deps (build tools present in case a native prebuilt binary isn't available for this arch) ---
FROM node:22-bookworm-slim AS serverdeps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

# --- runtime image ---
FROM node:22-bookworm-slim
WORKDIR /app/server
COPY --from=serverdeps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=webbuild /web/dist /app/web/dist

ENV NODE_ENV=production
ENV DB_PATH=/data/baby-tracker.db
EXPOSE 8099

CMD ["node", "src/index.js"]
