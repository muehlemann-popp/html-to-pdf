# The Alpine release pins the Chromium major (3.24 ships Chromium 155), keep it in sync with
# the puppeteer version in package.json, see AGENTS.md
FROM node:26-alpine3.24 AS base

# chrome-headless-shell (the lightweight "old headless" build) of this Alpine release, not the full
# browser: same Skia PDF output at about half the memory, see docs/adr/0001-chromium-headless-shell.md
RUN \
  apk upgrade --no-cache --available \
  && apk add --no-cache \
    chromium-headless-shell \
    font-freefont \
    font-noto-emoji \
    font-wqy-zenhei \
  && apk add --no-cache \
    tini \
  # node images ship no yarn since Node 26 (and no corepack since 25): corepack runs the yarn from
  # `packageManager` in package.json, which then uses the release committed in .yarn/releases
  && npm install --global corepack@0.36.0 \
  && corepack enable yarn \
  && mkdir -p /app/build \
  && adduser -D chrome \
  && chown -R chrome:chrome /app

WORKDIR /app

# Chromium comes from apk above, never let `yarn install` download another one
ENV \
  PUPPETEER_SKIP_DOWNLOAD=1 \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-headless-shell \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0

COPY deploy/local.conf /etc/fonts/local.conf
COPY favicon.ico .
COPY deploy/docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT ["tini", "--"]

EXPOSE 4000
CMD ["/docker-entrypoint.sh"]


# Bundles the service into build/main.prod.js, plain JavaScript that is the same for every platform:
# it runs on the build machine's own platform (no QEMU for the arm64 image of a multi-platform build)
# and needs no Chromium, so it does not start from `base`
FROM --platform=$BUILDPLATFORM node:26-alpine3.24 AS builder

# see `base`
RUN npm install --global corepack@0.36.0 && corepack enable yarn

WORKDIR /app

ENV \
  PUPPETEER_SKIP_DOWNLOAD=1 \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# dependencies first, so this layer is reused until the manifests or the lockfile change
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
RUN yarn install

COPY . /app
RUN yarn build


FROM base AS prod

COPY --from=builder /app/build/main.prod.js .
# the bundle is an ES module, say so instead of relying on node's syntax detection
RUN echo '{ "type": "module" }' > package.json

# Run Chrome as non-privileged
USER chrome


FROM base AS dev

# dependencies first, as in `builder`; installed as `chrome`, who runs the dev server
COPY --chown=chrome:chrome package.json yarn.lock .yarnrc.yml ./
COPY --chown=chrome:chrome .yarn/releases .yarn/releases
USER chrome
RUN yarn install

COPY --chown=chrome:chrome . /app

# last: a different value would otherwise invalidate the install above
ARG RELEASE_ID
ARG CI_BUILD_DATE
ENV \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE


FROM base AS test

# dependencies first, as in `builder`. As in prod, everything runs as `chrome`: Chromium refuses to
# start its sandbox as root (CHROME_SANDBOX=1)
COPY --chown=chrome:chrome package.json yarn.lock .yarnrc.yml ./
COPY --chown=chrome:chrome .yarn/releases .yarn/releases
USER chrome
RUN yarn install

COPY --chown=chrome:chrome . /app

# last: a different value would otherwise invalidate the install above
ARG RELEASE_ID
ARG CI_BUILD_DATE
ENV \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE
