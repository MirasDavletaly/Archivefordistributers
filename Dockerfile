FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY data/seed.json ./data/seed.json

# База лежит на отдельном томе, чтобы правки не терялись при обновлении образа.
ENV ARCHIVE_DB=/data/archive.db
ENV PORT=3000
VOLUME /data
EXPOSE 3000

CMD ["node", "server.mjs"]
