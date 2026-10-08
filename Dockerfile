# Runs UniSeva Portal anywhere that can run a container (Render, Fly.io, Railway, a campus server...).
# node:sqlite needs Node 22.13 or newer.
FROM node:22-slim
WORKDIR /app

# Packages first, so they are cached until package.json changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# The database and photos live in /data. Attach a persistent volume there to keep them across restarts.
ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/data/campusfix.db \
    UPLOAD_DIR=/data/uploads \
    TRUST_PROXY=1
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
