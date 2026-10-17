# Runs UniSeva Portal anywhere that can run a container (Render, Fly.io, Railway, a campus server...).
# Two stages: the first builds the React app, the second holds only what the running site needs.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --no-audit --no-fund
COPY apps ./apps
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
# Only the backend's packages are installed; the frontend is already built.
RUN npm ci --omit=dev --workspace @uniseva/backend --include-workspace-root --no-audit --no-fund
COPY apps/backend ./apps/backend
COPY --from=build /app/apps/frontend/dist ./apps/frontend/dist

# Photos and backups live in /data. Attach a persistent volume there to keep them across restarts.
# The database is MongoDB: set MONGODB_URI (docker-compose.yml starts one for you).
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    TRUST_PROXY=1
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/backend/src/index.js"]
