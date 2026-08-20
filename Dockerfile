# Container image for directories that verify an MCP server by starting it and
# asking what it can do (Glama does this). The server speaks stdio, so there is
# nothing to expose and no port to publish.
#
# No API key is needed to start or to answer initialize and tools/list: the key
# is read at request time and only matters once a tool actually calls the API.
# That is what lets an introspection check pass without credentials.
#
# For real use, pass the key in:
#   docker run --rm -i -e UPTYBOTS_API_KEY=upty_... uptybots-mcp-server

FROM node:22-alpine

WORKDIR /app

# Install dependencies from the lockfile before copying the source, so the
# layer is reused whenever only index.js changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY index.js ./
COPY lib ./lib

# Base URL is overridable for self-checks against another environment; the key
# is deliberately left unset so the image carries no credentials.
ENV UPTYBOTS_API_URL=https://uptybots.com

# Run as the unprivileged user the base image already provides.
USER node

ENTRYPOINT ["node", "index.js"]
