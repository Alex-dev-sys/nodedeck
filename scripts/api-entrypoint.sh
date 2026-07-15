#!/bin/sh
set -eu

node server/dist/db/migrate.js
node server/dist/db/seed.js
exec node server/dist/index.js
