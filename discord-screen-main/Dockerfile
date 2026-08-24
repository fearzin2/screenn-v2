FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json files
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install server dependencies
RUN cd server && npm install

# Install client dependencies
RUN cd client && npm install

# Copy all files
COPY server/ ./server/
COPY client/ ./client/

# Build the frontend (Vite)
RUN cd client && npm run build

# Move to server directory
WORKDIR /app/server

# Start the Node.js server
CMD ["node", "index.js"]
