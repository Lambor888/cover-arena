# Google Cloud backend + Netlify frontend

Deployment checked on 2026-10-29.

## Live backend

- VM: `cover-arena-server`, zone `northamerica-northeast2-c`, Ubuntu 24.04, e2-medium (4 GB).
- Public endpoint: `wss://34.130.69.170/ws`.
- Health: `https://34.130.69.170/health`.
- Application directory: `/home/kn394/cover-arena`.
- Service: `cover-arena.service` (enabled at boot, restarts on failure).
- Node 22 is installed at `/opt/node22`; the game listens only on `127.0.0.1:3000`.
- Nginx terminates TLS and proxies WebSocket traffic on 443. Port 80 serves certificate challenges and HTTPS redirects.
- Certificate: Let's Encrypt public IP certificate `cover-arena-ip`, short-lived. Certbot snap renewal timer is enabled; deployment hook reloads Nginx.
- The server holds rooms in memory. Restarting it ends active matches.

The VM currently uses an ephemeral external IP. Reserve/promote the current IP to a static address in Google Cloud before stopping/recreating the VM. If the IP changes, update the certificate, Nginx config, frontend endpoint and this document.

## Frontend upload

`netlify-cloud-frontend.zip` is a built static frontend, ready to upload to the EXISTING Netlify project's Deploys page. It includes root `index.html`, assets and `_headers`; it does not need a Netlify build or Functions.

Do not upload the old `netlify-ready-game.zip`: that package deliberately retains the previous all-Netlify implementation.

Current accepted frontend origins in `/etc/cover-arena.env`:

- `https://cover-arena.netlify.app` (current frontend name)
- `https://deft-hummingbird-a5e8c8.netlify.app`
- `https://moonlit-cuchufli-170d71.netlify.app`
- `http://127.0.0.1:5173`
- `http://127.0.0.1:4173`

If the Netlify site URL changes, update `ALLOWED_ORIGINS` and restart `cover-arena`. Origin checking limits browser access; it is not user authentication or complete abuse prevention.

## Build and package

Run `npm run build:cloud`, then PowerShell `./scripts/package-cloud.ps1`.
Set `VITE_GAME_WS_URL` when building to override the current backend URL.
Local development and training are unchanged. `npm run build:netlify` remains the old all-Netlify option.

Backend archive: `cloud-backend.zip`. The archive contains source and lockfile, never the SSH private key.
Provisioning script: `scripts/setup-cloud.sh`. It is configured for this VM/IP. Review it before deploying elsewhere.

## Verification

- Existing 101 tests passed before upload; production frontend build passed.
- Trusted WSS connection tested from the development computer with two independent players: both joined the same room and reached playing state.
- Certificate renewal dry run succeeded, including the Nginx reload hook. Both services are enabled at boot.
- A pistol shot was processed server-side and ammunition decreased to 9.
- A connection from an unapproved Origin was rejected with HTTP 403.
- Short sample of WebSocket ping round trips: 20–25 ms; snapshot intervals median 66 ms, p95 71 ms.
- These are network ping/snapshot observations, not a guarantee of input-to-display latency, capacity, or performance from every region.
- The Netlify frontend has not yet been uploaded or visually validated against the cloud backend.

Run `node scripts/smoke-websocket.mjs` to repeat the public smoke test (creates and cleans up a temporary room).

## Operations (on the VM)

```sh
sudo systemctl status cover-arena nginx
sudo journalctl -u cover-arena -n 100 --no-pager
sudo systemctl restart cover-arena
sudo /snap/bin/certbot certificates
sudo /snap/bin/certbot renew --dry-run --run-deploy-hooks
```

Deployment SSH public key is stored in VM metadata for `kn394`. Private key remains only on the operator's Windows computer, outside this project. Do not put private keys into release archives.
