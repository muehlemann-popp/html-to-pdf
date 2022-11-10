ARG RELEASE_ID
ARG CI_BUILD_DATE

FROM alpine:3.16 as base

# Installs latest Chromium package.
RUN \
  apk upgrade --no-cache --available \
  && apk add --no-cache \
    chromium \
    ttf-freefont \
    font-noto-emoji \
  && apk add --no-cache \
    --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing \
    font-wqy-zenhei \
  && apk add --no-cache \
    tini make gcc g++ python3 git nodejs npm yarn \
  && mkdir -p /app/build \
  && adduser -D chrome \
  && chown -R chrome:chrome /app

WORKDIR /app

COPY deploy/local.conf /etc/fonts/local.conf
COPY favicon.ico .
COPY deploy/docker-entrypoint.sh /docker-entrypoint.sh
COPY README.md .

ENTRYPOINT ["tini", "--"]

EXPOSE 4000
CMD ["/docker-entrypoint.sh"]


FROM base as builder

ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY . /app

RUN yarn install && yarn build


FROM base as prod

COPY --from=builder /app/build/main.prod.js .

# Run Chrome as non-privileged
USER chrome


FROM base as dev

ENV \
  CHROME_BIN=/usr/bin/chromium-browser \
  CHROME_PATH=/usr/lib/chromium/ \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

COPY . /app

RUN chown -R chrome ./

USER chrome

RUN yarn install


FROM base as test

ENV \
  CHROME_BIN=/usr/bin/chromium-browser \
  CHROME_PATH=/usr/lib/chromium/ \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

COPY . /app

RUN yarn install
