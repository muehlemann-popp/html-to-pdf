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
COPY README.md .

ENTRYPOINT ["tini", "--"]

EXPOSE 4000
CMD ["/docker-entrypoint.sh"]


FROM base AS builder

COPY . /app

RUN yarn install && yarn build


FROM base AS prod

COPY --from=builder /app/build/main.prod.js .

# Run Chrome as non-privileged
USER chrome


FROM base AS dev

ARG RELEASE_ID
ARG CI_BUILD_DATE
ENV \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

COPY . /app

RUN chown -R chrome ./

USER chrome

RUN yarn install


FROM base AS test

ARG RELEASE_ID
ARG CI_BUILD_DATE
ENV \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

COPY . /app

RUN yarn install
