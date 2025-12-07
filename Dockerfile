# ================================
# VoteAPI Dockerfile
# Multi-stage build for optimized production image
# ================================

# ================================
# Stage 1: Dependencies
# ================================
FROM node:20-alpine AS deps

# Install build dependencies for native modules (sharp, bcrypt)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --include=dev

# ================================
# Stage 2: Builder
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove development files
RUN rm -rf .git .env .env.* *.md docs/

# ================================
# Stage 3: Production
# ================================
FROM node:20-alpine AS production

# Install runtime dependencies only
RUN apk add --no-cache \
    vips \
    tini \
    curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S voteapi -u 1001 -G nodejs

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=57788

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code from builder
COPY --from=builder /app/app.js ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/config ./config
COPY --from=builder /app/controllers ./controllers
COPY --from=builder /app/middleware ./middleware
COPY --from=builder /app/models ./models
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/services ./services
COPY --from=builder /app/socket ./socket
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/utils ./utils
COPY --from=builder /app/validators ./validators

# Create directories for uploads and logs
RUN mkdir -p uploads/images uploads/documents uploads/temp logs && \
    chown -R voteapi:nodejs /app

# Switch to non-root user
USER voteapi

# Expose port
EXPOSE 57788

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:57788/health || exit 1

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "server.js"]

# ================================
# Stage 4: Development
# ================================
FROM node:20-alpine AS development

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    curl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies
RUN npm ci

# Copy application code
COPY . .

# Create directories
RUN mkdir -p uploads/images uploads/documents uploads/temp logs

# Set environment
ENV NODE_ENV=development
ENV PORT=57788

# Expose port
EXPOSE 57788

# Start with nodemon for hot reload
CMD ["npm", "run", "dev"]
