#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
IP=34.130.69.170
if ! test -x /opt/node22/bin/node; then
  work=$(mktemp -d)
  cd "$work"
  curl -fsSLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
  archive=$(awk '$2 ~ /linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
  test -n "$archive"
  curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$archive"
  grep " $archive\$" SHASUMS256.txt | sha256sum --check -
  sudo mkdir -p /opt/node22
  sudo tar -xJf "$archive" -C /opt/node22 --strip-components=1
  cd - >/dev/null
fi
export PATH="/opt/node22/bin:$PATH"
node --version
npm ci --no-audit --no-fund
npx tsc --noEmit
sudo mkdir -p /var/www/cover-arena
sudo tee /etc/nginx/sites-available/cover-arena >/dev/null <<'NGINX'
server {
 listen 80;
 server_name 34.130.69.170;
 location /.well-known/acme-challenge/ { root /var/www/cover-arena; }
 location / { return 404; }
}
NGINX
sudo ln -sfn /etc/nginx/sites-available/cover-arena /etc/nginx/sites-enabled/cover-arena
sudo nginx -t
sudo systemctl reload nginx
sudo /snap/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email --preferred-profile shortlived --webroot --webroot-path /var/www/cover-arena --ip-address "$IP" --cert-name cover-arena-ip --deploy-hook 'systemctl reload nginx'
sudo tee /etc/nginx/sites-available/cover-arena >/dev/null <<'NGINX'
limit_conn_zone $binary_remote_addr zone=arena_connections:10m;
server {
 listen 80;
 server_name 34.130.69.170;
 location /.well-known/acme-challenge/ { root /var/www/cover-arena; }
 location / { return 301 https://34.130.69.170$request_uri; }
}
server {
 listen 443 ssl;
 server_name 34.130.69.170;
 ssl_certificate /etc/letsencrypt/live/cover-arena-ip/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/cover-arena-ip/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 add_header X-Content-Type-Options nosniff always;
 location = /ws {
  limit_conn arena_connections 20;
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_read_timeout 65s;
  proxy_send_timeout 65s;
  proxy_buffering off;
 }
 location = /health { proxy_pass http://127.0.0.1:3000; }
 location / { return 404; }
}
NGINX
app_path=$(pwd)
app_user=$(id -un)
sudo tee /etc/systemd/system/cover-arena.service >/dev/null <<UNIT
[Unit]
Description=Cover Arena authoritative WebSocket server
After=network.target

[Service]
Type=simple
User=$app_user
WorkingDirectory=$app_path
Environment=PATH=/opt/node22/bin:/usr/bin:/bin
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
EnvironmentFile=/etc/cover-arena.env
ExecStart=/opt/node22/bin/node $app_path/node_modules/tsx/dist/cli.mjs server/start.ts
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
if ! sudo test -f /etc/cover-arena.env; then
 sudo tee /etc/cover-arena.env >/dev/null <<'ENV'
ALLOWED_ORIGINS=https://cover-arena.netlify.app,https://deft-hummingbird-a5e8c8.netlify.app,https://moonlit-cuchufli-170d71.netlify.app,http://127.0.0.1:5173,http://127.0.0.1:4173
ENV
fi
sudo systemctl daemon-reload
sudo systemctl enable --now cover-arena
sudo systemctl restart cover-arena
sudo nginx -t
sudo systemctl reload nginx
for attempt in {1..20}; do
 if curl -fsS http://127.0.0.1:3000/health; then break; fi
 sleep 1
done
sudo systemctl is-active cover-arena nginx
sudo /snap/bin/certbot certificates
sudo systemctl list-timers --all | grep certbot
