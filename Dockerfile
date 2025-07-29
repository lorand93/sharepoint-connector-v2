# Use the official Node.js 20 alpine image
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /usr/src/app

# Create non-root user early (better practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copy package files
COPY --chown=nestjs:nodejs package*.json ./

# Switch to non-root user for npm install (more secure)
USER nestjs

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code (as non-root user)
COPY --chown=nestjs:nodejs . .

# Build the application
RUN npm run build

# Expose the port
EXPOSE 3000

# Health check (improved with curl if available, fallback to node)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "run", "start:prod"]