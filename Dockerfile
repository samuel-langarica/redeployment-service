# Single stage build for simplicity
FROM node:18-alpine

WORKDIR /app

# Install git, Docker CLI, and Docker Compose for repository operations
RUN apk add --no-cache git openssh-client docker-cli docker-compose

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S redeployment -u 1001

# Set up SSH directory
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh

# Switch to non-root user
USER redeployment

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]
