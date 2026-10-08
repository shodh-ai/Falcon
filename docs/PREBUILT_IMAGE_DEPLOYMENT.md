# Falcon prebuilt-image deployment

Production must pull prebuilt images. It must not compile Falcon on the VPS.

## Release flow

```text
Push to main
  -> Falcon CI passes
  -> GitHub-hosted AMD64 runners build both images
  -> immutable sha-<40-character-commit> tags are published to GHCR
  -> an authorized operator promotes one tested SHA to :production
  -> Coolify pulls backend :production, verifies health, then pulls frontend
```

Published images:

```text
ghcr.io/shodh-ai/falcon-backend:sha-<commit>
ghcr.io/shodh-ai/falcon-frontend:sha-<commit>
```

Mutable `:production` tags are changed only by the protected **Promote production
images** workflow. Building and promotion are separate operations, so rollback
promotes an earlier immutable SHA without recompiling it.

## GitHub configuration

Create a protected GitHub environment named `production`. Require an authorized
reviewer for that environment.

Repository variables:

```text
PRODUCTION_API_URL=https://apifalcon.jataka.io
PRODUCTION_SAAS_BASE_DOMAIN=jataka.io
PRODUCTION_DEFAULT_TENANT=sgvu
PRODUCTION_GOOGLE_CLIENT_ID=<public OAuth client ID, when used>
```

Environment secrets:

```text
COOLIFY_BACKEND_DEPLOY_WEBHOOK=<backend deploy webhook URL>
COOLIFY_FRONTEND_DEPLOY_WEBHOOK=<frontend deploy webhook URL>
```

The repository is public and the images carry the OCI source label. Confirm the
two GHCR packages are public before configuring anonymous pulls. If package
visibility must remain private, register GHCR in Coolify with a read-only
`read:packages` credential instead.

## One-time Coolify conversion

Perform this only after the VPS is healthy and both `:production` images exist.

1. Record current application environment variables, domains, volumes, health
   checks and rollback image.
2. Disable automatic Git-source deployments for both applications.
3. Configure the backend as a Docker Image resource using:
   `ghcr.io/shodh-ai/falcon-backend:production`.
4. Preserve the backend environment variables and `/app/uploads` volume.
5. Expose container port `4000`; do not publish host mapping `4000:4000`.
6. Set backend health check to `/health` with at least 45 seconds start grace.
7. Configure the frontend as a Docker Image resource using:
   `ghcr.io/shodh-ai/falcon-frontend:production`.
8. Expose container port `3000`; do not publish a fixed host port.
9. Set frontend health check to `/` with at least 45 seconds start grace.
10. Set each runtime container to 1 GB memory, 512 MB reservation, 1.5 CPUs and
    rolling replacement. These are runtime limits; no production build occurs.
11. Copy the two Coolify deploy webhooks into the protected GitHub environment.
12. Run **Promote production images** with a tested SHA and `deploy=true`.

Do not delete the previous Git-backed applications until the image-backed
resources pass authenticated smoke tests. During cutover, only one resource may
own each public domain.

## Promotion and rollback

Promotion:

1. Open GitHub Actions -> **Publish production images** and confirm the tested
   SHA has both successful image jobs.
2. Run **Promote production images**.
3. Enter the full 40-character tested SHA.
4. Select `deploy=true` only when Coolify webhooks are configured.
5. Approve the protected `production` environment.

Rollback uses the same workflow with the last known-good SHA. It retags existing
images and redeploys; it does not rebuild source on the VPS.

## Host safety

- Keep Coolify build concurrency at one for unrelated applications.
- Never run `next build`, `npm ci`, Docker BuildKit builds or image exports on
  the production host.
- Keep at least 15 GB disk free for image pulls and rollback layers.
- Schedule image/build-cache pruning outside deployments.
- Keep the previous healthy container until its replacement passes health.
- A deployment cannot be declared successful until `/health`, the frontend,
  authenticated login and one critical finance API smoke test pass.
