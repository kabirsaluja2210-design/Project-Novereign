# Deployment

## The one thing that determines which path you take

The web process serves generated media (`/api/storage/*`) and the worker
process writes it (renders, mock provider output). With `STORAGE_DRIVER=local`
(the default), **they must share the same filesystem**, because they're
reading/writing the same files.

- **Single VPS / one Docker host**: trivial - both containers mount the same
  volume. Use this today, no code changes.
- **Separate managed services** (Railway, Render, Fly.io, ECS, etc.): most of
  these platforms attach a persistent volume/disk to exactly *one* service,
  not shared across services. Deploying web and worker as separate services
  there with local storage will silently break ("video ready" but 404 on
  download, because the file lives in the worker's disk, not the web
  service's). **Don't do this without first implementing the S3-compatible
  storage adapter** (the `ObjectStorage` interface already exists in
  `src/server/storage/index.ts` - implementing it against the AWS SDK for
  S3/R2/B2 is the actual remaining work; ask and I'll build it before you
  deploy this way).

If you just want it live on the web today with the least new work, use the
VPS + Docker Compose path below.

## Path A: single VPS + Docker Compose (works today, no code changes)

Any VPS with Docker installed (Hetzner, DigitalOcean, a home server, etc.).
1 vCPU / 2GB RAM is enough to try it; give the worker more CPU once you're
doing real renders regularly.

```bash
# On the VPS, with Docker + the Compose plugin installed:
git clone https://github.com/kabirsaluja2210-design/Project-Novereign.git
cd Project-Novereign
git checkout claude/epic-goodall-hfydkf   # or main, once merged

cp .env.example .env
# edit .env: at minimum set a real SESSION_SECRET, e.g.
#   openssl rand -hex 32
# and NEXT_PUBLIC_APP_NAME / APP_BASE_URL=https://yourdomain.com
# (DATABASE_URL/REDIS_URL are overridden by docker-compose.yml to point at
# the postgres/redis containers - don't worry about those two)

docker compose up -d --build
docker compose run --rm web npx prisma migrate deploy
docker compose run --rm web npm run db:seed
```

The app is now listening on port 3000 on the VPS. To get it onto a real
domain with HTTPS, put a reverse proxy in front - the included `Caddyfile`
does this with zero manual certificate work:

```bash
# point your domain's A record at the VPS's IP first, then:
sudo apt-get install -y caddy   # or see caddyserver.com/docs/install
# edit Caddyfile: replace yourdomain.com with your real domain
sudo caddy run --config Caddyfile
```

Open ports 80 and 443 in the VPS firewall (443 for HTTPS, 80 for the ACME
HTTP challenge Caddy uses to get the certificate). That's it - your domain
now serves the app over HTTPS, proxied to the Next.js container on
`localhost:3000`.

To redeploy after a `git pull`: `docker compose up -d --build`. To apply new
migrations: `docker compose run --rm web npx prisma migrate deploy`.

**Sandbox note**: I wrote and reviewed `Dockerfile`/`docker-compose.yml` here
but could not run a live `docker compose build` in this session - this
sandbox's network policy blocks pulling images from Docker Hub. There's
nothing exotic in the image (no native npm addons in this project - `bcryptjs`
and `ioredis` are both pure JS), so this should build cleanly on your VPS or
any normal CI runner; just budget a few minutes for the first build (`npm ci`
+ `next build` inside the image, plus `ffmpeg` via `apt-get`).

## Path B: managed platforms (Railway / Render / Fly.io / similar)

Works well once storage is on S3/R2/B2 instead of local disk (see the note
at the top). Once that's in place:

1. Managed Postgres 16 add-on, managed Redis add-on.
2. A "web" service built from this repo's `Dockerfile` with `--target web`,
   public port 3000, health check `GET /`.
3. A "worker" service built from the *same* `Dockerfile` with
   `--target worker`, no public port.
4. Both services get the same env vars: `DATABASE_URL`/`REDIS_URL` from the
   add-ons, `SESSION_SECRET`, `STORAGE_DRIVER=s3` + `STORAGE_*` bucket
   credentials, any provider keys.
5. Point your domain at the web service (most platforms give you a CNAME
   target and handle TLS automatically).

## Environment variables

See `.env.example` for the full list with comments. Minimum to run at all:
`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`. Everything else (provider
keys, OAuth, S3 credentials) is additive - the app runs on Mock providers
and local disk storage without them.

## Release checklist

1. `npx prisma migrate deploy` (not `migrate dev` - that's for local
   development only)
2. `npm run db:seed` (idempotent - upserts plans/styles, only inserts
   voices/templates if missing)
3. Deploy/restart the web image, then the worker image
4. Smoke test: sign up, Quick Create a short video, confirm the MP4 renders
   and downloads - the exact flow verified locally in this build (see
   CLAUDE_PROGRESS.md)

## Not addressed here

Load testing, backup/restore drills, blue-green or canary release, a CDN in
front of object storage, WAF/DDoS protection, a secrets manager (env vars
assumed injected by the platform or `.env` on the VPS). These are directive
§220 "production release criteria" items genuinely out of scope for this
build.
