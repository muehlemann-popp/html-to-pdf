# The Alpine release pins the Chromium major (3.24 ships Chromium 155), keep it in sync with
# the puppeteer version in package.json, see AGENTS.md. Node comes from the official image of the same
# Alpine release: both tags below must name the same release (the node binary links against its musl
# and libstdc++).
FROM node:26-alpine3.24 AS node

# corepack runs the yarn from `packageManager` in package.json, which then uses the release committed
# in .yarn/releases (node images ship no yarn since Node 26, and no corepack since 25). Plain
# JavaScript, so installed once on the build machine's platform, for the stages that run yarn; the
# prod image has neither npm nor corepack nor yarn
FROM --platform=$BUILDPLATFORM node AS corepack

RUN npm install --global corepack@0.36.0


FROM alpine:3.24 AS base

# chrome-headless-shell (the lightweight "old headless" build) of this Alpine release, not the full
# browser: same Skia PDF output at about half the memory, see docs/adr/0001-chromium-headless-shell.md.
# libstdc++ and libatomic (amd64) are what the node binary links against, as in the node image (check
# with `ldd /usr/local/bin/node` on every platform when changing the release). `chrome` keeps uid
# 1001, which it had next to the node image's `node` user (README: runAsUser 1001)
RUN \
  apk upgrade --no-cache --available \
  && apk add --no-cache \
    chromium-headless-shell \
    font-freefont \
    font-noto-emoji \
    font-wqy-zenhei \
  && apk add --no-cache \
    libatomic \
    libstdc++ \
    tini \
  && mkdir -p /app/build \
  && adduser -D -u 1001 chrome \
  && chown -R chrome:chrome /app

# only the node binary of the node image: not npm, npx, corepack or the C headers
COPY --from=node /usr/local/bin/node /usr/local/bin/node

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
FROM corepack AS builder

RUN corepack enable yarn

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


# `base` plus yarn, for the stages that install the dependencies
FROM base AS yarn

COPY --from=corepack /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/corepack
RUN \
  ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
  && corepack enable yarn


FROM yarn AS dev

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


FROM yarn AS test

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
