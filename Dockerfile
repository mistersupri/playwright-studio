# Use official Node.js runtime as the base
FROM node:20-bookworm-slim

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=3000

# Install standard utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Establish application directory
WORKDIR /app

# Copy dependency descriptors
COPY package*.json ./

# Install npm dependencies (including devDependencies required for the build stage)
RUN npm install

# Copy application sources
COPY . .

# Run production build (compiles the React client, plus the Express server bundle)
RUN npm run build

# Install Playwright browser executables and system dependencies (NSS, GLib, etc.) for Chromium
RUN npx playwright install --with-deps chromium

# Prune devDependencies to reduce image size and keep runtime clean
RUN npm prune --production

# Ensure necessary folders for execution data and artifacts are constructed
RUN mkdir -p /app/server-data /app/screenshots /app/pdf /app/excel /app/uploads

# Expose ingress port 3000
EXPOSE 3000

# Production start script command
CMD ["npm", "start"]
