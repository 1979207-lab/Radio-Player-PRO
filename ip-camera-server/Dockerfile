FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ip-camera-server/package.json ./package.json
RUN npm install --omit=dev
COPY ip-camera-server/server.js ./server.js
COPY ip-camera ./public
ENV PORT=8090
EXPOSE 8090
CMD ["node","server.js"]