# Use official Node.js image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy remaining files
COPY . .

# Expose your app port
EXPOSE 8318

# Start the app
CMD ["node", "app.js"]
