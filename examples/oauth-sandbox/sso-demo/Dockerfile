FROM node:26-alpine
WORKDIR /app
COPY package.json server.mjs ./
USER node
EXPOSE 8282
CMD ["node", "server.mjs"]
