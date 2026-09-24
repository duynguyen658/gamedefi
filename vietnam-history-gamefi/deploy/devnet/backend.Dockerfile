FROM node:20-alpine AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./

# Browser variables are public and baked into the static build. Keep private RPC keys out.
ARG VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
ENV VITE_API_URL=/api \
    VITE_SOLANA_NETWORK=devnet \
    VITE_SOLANA_RPC_URL=${VITE_SOLANA_RPC_URL}
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/srv/gamefi/backend

WORKDIR /srv/gamefi/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY assets /srv/gamefi/assets
COPY database/migrations /srv/gamefi/database/migrations
COPY scripts/apply-migrations.py /srv/gamefi/scripts/apply-migrations.py
COPY deploy/devnet/start.sh /srv/gamefi/deploy/devnet/start.sh
COPY --from=frontend-build /build/frontend/dist /srv/gamefi/frontend/dist

EXPOSE 8000
CMD ["sh", "/srv/gamefi/deploy/devnet/start.sh"]
