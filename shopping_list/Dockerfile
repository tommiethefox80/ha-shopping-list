# Home Assistant passes BUILD_FROM=<its base image>; we use plain Node on Alpine instead
# (multi-arch: amd64 and arm64), the same as the Chores add-on.
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY server server
COPY web web
RUN cd web && npm run build \
 && cd ../server && npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
ENV NODE_ENV=production PORT=8099 TZ=Europe/London
EXPOSE 8099
CMD ["node", "/app/server/dist/index.js"]
