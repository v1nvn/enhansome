# awesome-list-toolkit/enhance-readme-stars/Dockerfile
FROM node:24-slim

LABEL version="1.0.0"
LABEL description="Enhances markdown files with GitHub star counts."
LABEL maintainer="Your Name/Organization"

# Set working directory
WORKDIR /app

# Copy application dependency manifests
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy compiled JavaScript and entrypoint script
# We assume TypeScript is compiled to a 'dist' directory before building the Docker image,
# OR that entrypoint.sh directly runs ts-node.
# For simplicity and smaller image, pre-compiling is better.
# If you are committing the 'dist' folder:
# COPY dist ./dist
# If you are compiling in a build stage (more advanced Dockerfile):
# (This Dockerfile assumes you run `npm run build` locally and commit `dist`)

# For this example, we'll copy the src and compile in the Docker image.
# This makes the action self-contained for building.
COPY src ./src
COPY tsconfig.json .
RUN npm install typescript --global # or add as devDependency and use npx tsc
RUN npm install --save-dev @types/node # if not already in package.json devDependencies
RUN tsc # This will compile src/*.ts to dist/*.js based on tsconfig.json

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
