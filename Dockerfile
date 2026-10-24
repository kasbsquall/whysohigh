# Why So High in sample mode: no keys, no network calls, the same agent code.
#   docker build -t whysohigh .
#   docker run --rm -p 127.0.0.1:8787:8787 --memory 512m --cpus 1 whysohigh
# Then open http://localhost:8787 or POST a request to /api/run (see input_examples/).
# For live mode, pass --env-file .env; Nightshift and Zetaris must be reachable from the container.

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run web:build && mkdir -p logs out && chown -R node:node logs out

ENV SAMPLE_MODE=true \
    HOST=0.0.0.0 \
    PORT=8787

EXPOSE 8787
USER node
CMD ["npx", "tsx", "server/index.ts"]
