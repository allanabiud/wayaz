#!/bin/sh
# Runs once when the MariaDB data volume is first created (initdb.d).
# Django's test runner needs to CREATE/DROP its own `test_*` databases,
# which the default app user is not granted on by the image's defaults.
set -e
mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}" <<'SQL'
GRANT ALL PRIVILEGES ON `test_%`.* TO 'wayaz'@'%';
FLUSH PRIVILEGES;
SQL
echo "wayaz: granted test_% privileges"
