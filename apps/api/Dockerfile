FROM node:24-alpine AS dependencies
WORKDIR /workspace/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY apps/api/ ./
COPY packages/ /workspace/packages/
RUN npm run build

FROM node:24-alpine AS production-dependencies
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/api/drizzle ./drizzle
COPY --chown=node:node apps/api/package.json apps/api/start.cjs ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]