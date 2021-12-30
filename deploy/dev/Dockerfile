FROM zenika/alpine-chrome:with-node

ENV \
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# change user to bypass write limitations
USER root

WORKDIR /app
COPY . /app

RUN chown -R chrome ./

# change user back to one used by zenika image
USER chrome

RUN yarn install && mkdir build
