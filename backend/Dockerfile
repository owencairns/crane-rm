# Simple production Dockerfile using pre-built code
FROM node:20-alpine

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy pre-built application
COPY dist ./dist

# Change ownership to non-root user
RUN chown -R expressjs:nodejs /app

# Switch to non-root user
USER expressjs

# Expose port (Cloud Run will override this)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "dist/index.js"]
