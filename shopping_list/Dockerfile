ARG BUILD_FROM=mcr.microsoft.com/playwright:v1.65.0-noble

FROM ${BUILD_FROM} AS build
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY server server
COPY web web
RUN cd web && npm run build \
 && cd ../server && npm run build && npm prune --omit=dev

FROM ${BUILD_FROM}
# Xvfb lets Chromium run "headed" (looks like a normal browser to Tesco) without a screen.
RUN apt-get update && apt-get install -y --no-install-recommends xvfb xauth \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY run.sh /run.sh
RUN chmod a+x /run.sh
ENV NODE_ENV=production PORT=8099
EXPOSE 8099
CMD ["/run.sh"]
