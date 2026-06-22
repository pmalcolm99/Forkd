#!/bin/sh
set -e

# Named Docker volumes mount as root-owned by default. Existing volumes created
# before the image set their ownership stay root-owned, so the app (running as the
# unprivileged "node" user) can't write to them. Fix ownership here at startup
# (we're root at this point), then drop privileges to node and run the app.
chown node:node /app/uploads /app/backups 2>/dev/null || true

exec su-exec node:node "$@"
