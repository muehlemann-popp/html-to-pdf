#!/bin/sh

# node server will exit if it faces an issue it cannot fix, so we have an auto-restart here
while true; do
  node main.prod.js
done
