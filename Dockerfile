# Stage 1: build
FROM node:24-alpine AS builder

WORKDIR /usr/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Stage 2: prodution
FROM node:24-alpine AS prod

WORKDIR /usr/app

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /usr/app/dist ./dist

CMD ["node", "dist/main"]