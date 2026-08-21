FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs openapi.json ./

# Non-root, matching the repo's container conventions.
USER node

EXPOSE 8281
CMD ["node", "server.mjs"]
