FROM ghcr.io/puppeteer/puppeteer:latest

# Working directory inside the container
WORKDIR /home/pptruser/app

# Copy package files with appropriate permissions for the default non-root user
COPY --chown=pptruser:pptruser package*.json ./

# Install dependencies (this will install the exact puppeteer version needed)
RUN npm install

# Copy all project files
COPY --chown=pptruser:pptruser . .

# Expose the server port
EXPOSE 3300

# Start the application
CMD ["node", "live_tracker.js"]
