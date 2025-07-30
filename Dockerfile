# --- Stage 1: Builder ---
# This stage installs all dependencies and builds the application.
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the application
RUN npm run build

# Remove development dependencies for a cleaner final image
RUN npm prune --production


# --- Stage 2: Production ---
# This stage creates the final, lightweight production image.
FROM node:24-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Set the user
USER nestjs

WORKDIR /usr/src/app

# Copy the built application and production node_modules from the builder stage
COPY --chown=nestjs:nodejs --from=builder /usr/src/app/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=nestjs:nodejs --from=builder /usr/src/app/package.json ./package.json


# Expose the port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application from the compiled code
CMD ["node", "dist/main"]
