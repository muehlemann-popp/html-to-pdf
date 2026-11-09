#!/bin/sh

# node exits when it hits an error it cannot recover from (README "Errors"), so it is restarted here,
# after a pause so that a failure at startup does not restart it in a tight loop.
#
# SIGTERM and SIGINT (docker stop, a Kubernetes rollout; tini passes them to this shell) are forwarded
# to node as SIGTERM: it finishes the requests in flight (SHUTDOWN_TIMEOUT_MS) and exits, and the loop
# ends with node's exit code instead of starting it again.

stopping=
child=

stop() {
  stopping=1
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null
  fi
}
trap stop TERM INT

while :; do
  node main.prod.js &
  child=$!
  # a signal that came before $child was set
  if [ -n "$stopping" ]; then
    kill -TERM "$child" 2>/dev/null
  fi
  # wait returns early when a trapped signal arrives, so wait until node has really exited
  while :; do
    wait "$child"
    status=$?
    kill -0 "$child" 2>/dev/null || break
  done
  child=
  if [ -n "$stopping" ]; then
    exit "$status"
  fi
  echo "node exited with status $status, restarting in 1s" >&2
  sleep 1
  if [ -n "$stopping" ]; then
    exit "$status"
  fi
done
