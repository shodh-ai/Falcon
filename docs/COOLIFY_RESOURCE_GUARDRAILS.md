# Coolify production resource guardrails

Falcon's production images are built on GitHub-hosted runners. The production
VPS pulls completed images and does not compile application source.

The Dockerfiles retain local/CI build guardrails:

- Frontend build workers are capped at two.
- Frontend and backend build heaps are capped at 2 GB.
- Each production Node process is capped at a 768 MB heap.
- Images use multi-stage builds and exclude `node_modules`, `.next`, tests, coverage, logs and local uploads from build contexts.
- Runtime containers expose health checks with a 45-second startup allowance.
- The backend Compose service is capped at 1 GB RAM, 1.5 CPU and 256 processes, with graceful shutdown.
- Database migrations are not executed during image build. The backend startup
  runner uses a PostgreSQL advisory lock, so concurrent replicas cannot race.

## Required Coolify settings

Apply these once in the Coolify UI for both applications:

| Setting                                                      |                                      Frontend |                                      Backend |
| ------------------------------------------------------------ | --------------------------------------------: | -------------------------------------------: |
| Resource type                                                |                                  Docker Image |                                 Docker Image |
| Image                                                        | `ghcr.io/shodh-ai/falcon-frontend:production` | `ghcr.io/shodh-ai/falcon-backend:production` |
| Build concurrency on host                                    |                                             1 |                                            1 |
| Memory hard limit                                            |                                          1 GB |                                         1 GB |
| Memory soft reservation                                      |                                        512 MB |                                       512 MB |
| CPU limit                                                    |                                           1.5 |                                          1.5 |
| Health-check grace period                                    |                                    45 seconds |                                   45 seconds |
| Rolling update                                               |                                       Enabled |                                      Enabled |
| Keep previous healthy container until replacement is healthy |                                       Enabled |                                      Enabled |

Do not build Falcon on the production VPS. See
[`PREBUILT_IMAGE_DEPLOYMENT.md`](./PREBUILT_IMAGE_DEPLOYMENT.md).

## Safe deployment sequence

1. Confirm at least 15 GB free disk and adequate runtime memory.
2. Promote a tested immutable backend and frontend image pair.
3. Pull and start the backend image; its advisory-locked migration runner applies
   pending forward-only migrations before the API accepts traffic.
4. Verify `GET /health` and critical authenticated APIs.
5. Pull and start the frontend image and wait for its health check.
6. Keep the previous healthy container until the new container passes health checks.
7. Prune old build cache/images only through a scheduled maintenance policy, never during an active deployment.

If an emergency host-side build is unavoidable, require at least 5 GB available
memory and 15 GB free disk first. Swap is not a substitute for sufficient build
memory, but 2–4 GB encrypted swap can protect the host from a transient spike.
