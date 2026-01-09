FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files and prisma
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Create data directory for fallback JSON storage
RUN mkdir -p /app/data/filters

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7000
ENV CLEANSTREAM_DATA_DIR=/app/data/filters

# Expose port
EXPOSE 7000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7000/api/health || exit 1

# Run the application (migrations run automatically on startup)
CMD ["node", "src/index.js"]
