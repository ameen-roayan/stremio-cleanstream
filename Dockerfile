FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p /app/data/filters

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7000
ENV CLEANSTREAM_DATA_DIR=/app/data/filters

# Expose port
EXPOSE 7000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7000/api/health || exit 1

# Run the application
CMD ["node", "src/index.js"]
