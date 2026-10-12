# BlindPass deployment package

- `blindpass-source.tar.gz`: application source, Dockerfile, Compose configuration, templates, maintenance scripts, tests, and documentation.
- `SHA256SUMS`: checksum for the archive.

```bash
sha256sum -c SHA256SUMS
tar -xzf blindpass-source.tar.gz
cd blindpass
```

Read `docs/docker-deployment.md` for the complete deployment guide and `docs/docker-verification.md` for executed checks.

Local simulation:

```bash
docker compose up --build -d --wait --wait-timeout 300
```

Open `http://localhost:3000`.

New public service:

```bash
./scripts/deploy.sh init
# Fill .env.production with your domain, public fingerprint, password, and scanner configuration.
./scripts/deploy.sh check
./scripts/deploy.sh build
./scripts/deploy.sh up
```

The deployment host needs Docker/Compose and Bash; Node and pnpm run inside containers. Real Zcash payments require a separately deployed scanner bridge. The archive contains no live secrets, issuer keys, databases, videos, or prebuilt container images. Existing services must retain their original keys and current database state.
