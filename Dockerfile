FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY web/package*.json ./web/
COPY server/package*.json ./server/
RUN npm ci --prefix web && npm ci --prefix server

COPY . .
RUN npm run build --prefix web
RUN cd server && npx tsc -p tsconfig.json

FROM node:24-bookworm-slim
WORKDIR /app/server
ENV NODE_ENV=production
ENV PORT=8080

COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/web/dist /app/web/dist

EXPOSE 8080
CMD ["node", "dist/server.js"]