FROM node:22-alpine
WORKDIR /app

# Install all workspace deps
COPY package*.json ./
COPY shared/package.json shared/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci

# Copy source, type-check the whole monorepo, and build the frontend
# (server runs straight from source via tsx)
COPY . .
RUN npm run typecheck && npm run build -w @spool/web

ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "apps/server/src/index.ts"]
