#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 VPS for Aatman. Run as root:
#   ssh root@<vps> 'bash -s' < deploy/scripts/bootstrap-vps.sh
# Installs Docker, creates the `deploy` user (with root's SSH keys), enables the firewall
# (SSH, HTTP, HTTPS only), automatic security updates, fail2ban and swap, and turns off
# SSH password logins. Safe to re-run.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
. /etc/os-release
[[ "$ID" == "ubuntu" ]] || echo "Warning: written for Ubuntu, found $PRETTY_NAME." >&2

export DEBIAN_FRONTEND=noninteractive
echo "==> Packages"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Rotate container logs and keep containers running while the Docker daemon restarts.
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
JSON
systemctl enable docker
systemctl restart docker

echo "==> deploy user"
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [[ -s /root/.ssh/authorized_keys ]]; then
  touch /home/deploy/.ssh/authorized_keys
  sort -u /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys -o /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys
fi
install -d -m 750 -o deploy -g deploy /opt/aatman /opt/aatman/releases /opt/aatman/shared /opt/aatman/backups
chmod 700 /opt/aatman/shared

echo "==> SSH: keys only"
if [[ -s /home/deploy/.ssh/authorized_keys ]]; then
  cat > /etc/ssh/sshd_config.d/99-aatman.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
else
  echo "Warning: no SSH keys found for root; leaving password login on. Add a key, then re-run." >&2
fi

echo "==> Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban (SSH)"
cat > /etc/fail2ban/jail.d/aatman.conf <<'CONF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> Swap (lets a small VPS build the image)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-aatman.conf
fi

timedatectl set-timezone UTC

echo
echo "Done. From your machine, deploy with:  deploy/deploy.sh deploy@<this-server>"
