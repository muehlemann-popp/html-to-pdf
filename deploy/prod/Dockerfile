FROM node:16-alpine as builder

WORKDIR /app
COPY . /app

RUN yarn install && yarn build


FROM zenika/alpine-chrome:with-node as final

ARG RELEASE_ID
ARG CI_BUILD_DATE

ENV \
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
  RELEASE_ID=$RELEASE_ID \
  CI_BUILD_DATE=$CI_BUILD_DATE

WORKDIR /usr/src/app
COPY --from=builder /app/build/main.prod.js .
COPY favicon.ico .
COPY deploy/services/printer/docker-entrypoint.sh /docker-entrypoint.sh
COPY README.md .

ENTRYPOINT ["tini", "--"]

EXPOSE 4000
CMD ["/docker-entrypoint.sh"]
