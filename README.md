# Cover Arena — Tactical Duels

A 1v1 tactical browser game built with ChatGPT. Break cover, combine five weapons and rage abilities, and use oil, fire, water, and bushes to outplay your opponent.

**Play:** https://cover-arena.netlify.app  
Enter the same room code in two browsers to duel, or choose **Explore the training arena** for a local practice scene.

## Technology

| Layer | Technology and purpose |
| --- | --- |
| Language | TypeScript 5.9; shared client/server combat and map rules |
| 3D graphics | Babylon.js 8, WebGL, procedural meshes, custom visibility shaders, cartoon lighting and FXAA |
| Frontend tooling | Vite 7, HTML and CSS; no React dependency |
| Audio | Web Audio API for synthesized positional cues |
| Realtime backend | Node.js 22.12+, ws WebSockets, authoritative room simulation |
| Headless simulation | Babylon.js NullEngine to reuse scene/combat code on the server |
| Testing | Node.js test runner through tsx; TypeScript type checking |
| Production frontend | Netlify static hosting |
| Production backend | Google Cloud Compute Engine, Ubuntu, Nginx reverse proxy, systemd and Certbot TLS renewal |
| Alternative deployment | Netlify Functions and Netlify Blobs with conditional writes; retained as a separate deployment mode |

The current live architecture uses a persistent WebSocket server on Google Cloud. Netlify serves the frontend. The server validates input and resolves movement, collisions, damage, ammunition, pickups, and round outcomes. Rooms are held in memory: restarting the backend clears active matches.

The server simulates at 30 ticks/second and sends snapshots at 15 updates/second. The client renders independently and smooths network movement. Fog of war, exploration memory and approximate sound cues provide tactical information.

## Run locally

Install Node.js **22.12 or newer**, then:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173 in two tabs and enter the same room code. The Vite plugin starts the local WebSocket backend automatically. Training is available at http://127.0.0.1:5173/?training=1.

On Windows, you can also use `start-game.bat`. If PowerShell blocks npm scripts, use `npm.cmd`.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Left click | Attack once; holding does not repeat |
| 1–5 | Pistol, sword, launcher, grenade, shotgun |
| Q | Use the selected weapon's ultimate at 100 rage |
| F | Reload |
| R | Ready for the next round, or reset training |

See [GAME_MECHANICS.md](GAME_MECHANICS.md) for weapons, terrain interactions, pickups and scoring.

## Test and build

```sh
npm test
npm run build
npm run preview
```

Tests cover combat, terrain, visibility, pickups, ultimates, room lifecycle and both networking implementations. Build performs a TypeScript check before bundling.

## Deployment modes

### Netlify frontend + Google Cloud backend (current)

1. Run the persistent backend with `npm run start:server`.
2. Set `ALLOWED_ORIGINS` to the exact frontend origins. Production requires an explicit allowlist.
3. Terminate TLS with Nginx and proxy `/ws` to the Node service. `/health` reports service availability.
4. Set `VITE_GAME_WS_URL` to your public `wss://.../ws` endpoint and run `npm run build:cloud`.
5. Publish `release-check/cloud-frontend` as a static site.

`scripts/build-cloud.mjs` defaults to this project's deployed endpoint; override it for your own server. Frontend environment variables are public build-time settings, never secrets.

On Windows, `scripts/package-cloud.ps1` generates deployment ZIPs after building. See [GOOGLE-CLOUD-DEPLOY.md](GOOGLE-CLOUD-DEPLOY.md). The provisioning script is specific to this deployment; review its host, origins and system changes before running on another machine.

**Renaming the Netlify site changes its origin. Update the backend's ALLOWED_ORIGINS or connections will be rejected.**

### All-Netlify alternative

`npm run build:netlify` builds the Functions/Blobs mode. See [NETLIFY-DEPLOY.md](NETLIFY-DEPLOY.md). The root `netlify.toml` configures this alternative; do not use it unchanged when setting up a Git-connected build for the Google Cloud backend. For that architecture, select `npm run build:cloud` and publish `release-check/cloud-frontend`.

## Source layout

- `src/`: rendering, input, shared gameplay, visibility, resources and client networking.
- `server/`: authoritative rooms, WebSocket transport and standalone server.
- `server/netlify/`, `netlify/functions/`: alternative serverless transport.
- `scripts/`: builds, packaging, deployment and smoke checks.
- `GAME_MECHANICS.md`: current implemented rules.
- `GAME_DESIGN.md`: historical design discussion, including superseded proposals.
- `docs/DEVELOPMENT_HISTORY.md`: archived development notes, not current specifications.

## Prototype limits

Desktop keyboard and mouse are required. There are no accounts, persistent rankings, reconnect recovery or cross-instance room coordination. Training uses a moving target rather than a competitive AI. Explosions use radius-based damage rather than full physical blast occlusion. Weapon balance and networking remain areas for further playtesting.

Assets are generated in code; Blender is not required. Dependencies, build outputs, deployment ZIPs, credentials and local screenshots are excluded from version control.
