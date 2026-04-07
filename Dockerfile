FROM node:22-slim

WORKDIR /app

# Install all deps (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.js"]
