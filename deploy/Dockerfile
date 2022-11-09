ARG RELEASE_ID
ARG CI_BUILD_DATE
ARG CHROME_BIN=/usr/bin/chromium-browser
ARG CHROME_PATH=/usr/lib/chromium/
ARG PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

FROM alpine:3.16 as base

# Installs latest Chromium package.
RUN \
  apk upgrade --no-cache --available \
  && apk add --no-cache  \
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


FROM base as builder

ENV \
  CHROME_BIN=$CHROME_BIN \
  CHROME_PATH=$CHROME_PATH \
  PUPPETEER_SKIP_DOWNLOAD=1 \
  PUPPETEER_EXECUTABLE_PATH=$PUPPETEER_EXECUTABLE_PATH

COPY . /app

RUN yarn install && yarn build


FROM base as prod

ENV \
  CHROME_BIN=$CHROME_BIN \
  CHROME_PATH=$CHROME_PATH \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

COPY deploy/local.conf /etc/fonts/local.conf
COPY --from=builder /app/build/main.prod.js .
COPY favicon.ico .
COPY deploy/docker-entrypoint.sh /docker-entrypoint.sh
COPY README.md .

# Run Chrome as non-privileged
USER chrome

ENTRYPOINT ["tini", "--"]

EXPOSE 4000
CMD ["/docker-entrypoint.sh"]


FROM prod as dev

ENV \
  CHROME_BIN=$CHROME_BIN \
  CHROME_PATH=$CHROME_PATH \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

# change user to bypass write limitations
USER root

COPY . /app

RUN chown -R chrome ./

# change user back to default
USER chrome

RUN yarn install


FROM prod as test

ENV \
  CHROME_BIN=$CHROME_BIN \
  CHROME_PATH=$CHROME_PATH \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

# change user to bypass write limitations
USER root

COPY . /app

RUN yarn install
