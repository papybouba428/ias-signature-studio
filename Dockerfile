# Node 22 + Python 3 + Pillow (génération du GIF des campagnes)
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pil && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.js make_gif.py ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 PYTHON=python3 DATA_DIR=/mnt/data
EXPOSE 3000
CMD ["node", "server.js"]
