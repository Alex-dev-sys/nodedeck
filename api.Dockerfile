FROM node:22.23.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json tsconfig.server.build.json ./
COPY server ./server
RUN npm run api:build

FROM node:22.23.1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/db/migrations ./server/dist/db/migrations
COPY scripts/api-entrypoint.sh ./scripts/api-entrypoint.sh
RUN chmod +x ./scripts/api-entrypoint.sh
USER node
EXPOSE 8787
ENTRYPOINT ["./scripts/api-entrypoint.sh"]
