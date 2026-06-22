#!/bin/sh
set -e

# This image expects to start as root: it fixes ownership of the mounted volumes
# (named volumes mount root-owned by default) and then drops to the unprivileged
# "node" user. But a docker-compose `user:` override can force a non-root uid, in
# which case su-exec's setgroups() would fail and crash the container. So only do
# the root dance when we actually are root; otherwise just run the app as-is.
if [ "$(id -u)" = "0" ]; then
  chown node:node /app/uploads /app/backups 2>/dev/null || true
  exec su-exec node:node "$@"
else
  # Already non-root (e.g. compose `user: "1000:1000"`). Volume ownership can't be
  # fixed here; backups need the compose override removed, but the app still runs.
  exec "$@"
fi
