FROM zenika/alpine-chrome:with-node

ENV \
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY .. /app

# change user to bypass write limitations
USER root
RUN yarn

# change user back to one used by zenika image
USER chrome
