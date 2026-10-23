#!/usr/bin/env bash
# Ships the committed code (git HEAD) to the VPS and rolls it out.
# Usage: deploy/deploy.sh deploy@<vps> [<domain> <acme-email>]
# The first run creates /opt/aatman/shared/.env from the domain and email, then stops so
# you can fill in SSO and staff emails. Uncommitted changes are never deployed.
set -euo pipefail

host=${1:?usage: deploy/deploy.sh deploy@<vps> [<domain> <acme-email>]}
domain=${2:-}
email=${3:-}
cd "$(git rev-parse --show-toplevel)"

release="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short=10 HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Note: you have uncommitted changes. Only the last commit ($(git rev-parse --short HEAD)) is deployed." >&2
fi

echo "==> Uploading $release to $host"
git archive --format=tar.gz HEAD | ssh "$host" "set -e
  d=/opt/aatman/releases/$release
  mkdir -p \"\$d\"
  tar -xzf - -C \"\$d\""

remote_deploy="/opt/aatman/releases/$release/deploy"
if ! ssh "$host" "test -f /opt/aatman/shared/.env"; then
  if [[ -z "$domain" || -z "$email" ]]; then
    echo "First deploy: pass the domain and an email for Let's Encrypt:" >&2
    echo "  deploy/deploy.sh $host aatman.nitp.ac.in you@nitp.ac.in" >&2
    exit 2
  fi
  ssh "$host" "$remote_deploy/scripts/init-env.sh '$domain' '$email'"
  echo
  echo "Now edit the settings on the server, then run this script again:"
  echo "  ssh $host 'nano /opt/aatman/shared/.env'"
  exit 0
fi

ssh -t "$host" "$remote_deploy/scripts/release.sh '$release'"
