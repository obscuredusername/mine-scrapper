FROM ghcr.io/railwayapp/nixpacks:ubuntu-1745885067

ENTRYPOINT ["/bin/bash", "-l", "-c"]
WORKDIR /app/


COPY .nixpacks/nixpkgs-ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.nix .nixpacks/nixpkgs-ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.nix
RUN nix-env -if .nixpacks/nixpkgs-ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.nix && nix-collect-garbage -d


ARG CI NIXPACKS_METADATA NODE_ENV NPM_CONFIG_PRODUCTION PORT PROXY_LIST VPS_BASE_URL VPS_IMAGE_QUALITY VPS_MAX_FILE_SIZE VPS_UPLOAD_DIR
ENV CI=$CI NIXPACKS_METADATA=$NIXPACKS_METADATA NODE_ENV=$NODE_ENV NPM_CONFIG_PRODUCTION=$NPM_CONFIG_PRODUCTION PORT=$PORT PROXY_LIST=$PROXY_LIST VPS_BASE_URL=$VPS_BASE_URL VPS_IMAGE_QUALITY=$VPS_IMAGE_QUALITY VPS_MAX_FILE_SIZE=$VPS_MAX_FILE_SIZE VPS_UPLOAD_DIR=$VPS_UPLOAD_DIR

# setup phase
# noop

# install phase
ENV NIXPACKS_PATH=/app/node_modules/.bin:$NIXPACKS_PATH
COPY . /app/.
RUN --mount=type=cache,id=MTQgNFYiNr8-/root/npm,target=/root/.npm npm ci

# build phase
# noop


RUN printf '\nPATH=/app/node_modules/.bin:$PATH' >> /root/.profile


# start
COPY . /app

CMD ["npm run start"]

