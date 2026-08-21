FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
USER node
EXPOSE 8282
CMD ["node", "server.mjs"]
