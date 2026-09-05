# Coolify production resource guardrails

Falcon's Dockerfiles are designed to avoid taking down a shared production host:

- Frontend build workers are capped at two.
- Frontend and backend build heaps are capped at 2 GB.
- Each production Node process is capped at a 768 MB heap.
- Images use multi-stage builds and exclude `node_modules`, `.next`, tests, coverage, logs and local uploads from build contexts.
- Runtime containers expose health checks with a 45-second startup allowance.
- The backend Compose service is capped at 1 GB RAM, 1.5 CPU and 256 processes, with graceful shutdown.
- Database migrations are not executed during image build or by every application replica.

## Required Coolify settings

Apply these once in the Coolify UI for both applications:

| Setting | Frontend | Backend |
|---|---:|---:|
| Build pack | Dockerfile | Docker Compose (`backend/docker-compose.yaml`) |
| Build concurrency on host | 1 | 1 |
| Memory hard limit | 1 GB | 1 GB |
| Memory soft reservation | 512 MB | 512 MB |
| CPU limit | 1.5 | 1.5 |
| Health-check grace period | 45 seconds | 45 seconds |
| Rolling update | Enabled | Enabled |
| Keep previous healthy container until replacement is healthy | Enabled | Enabled |

Do not build frontend and backend simultaneously on a host with less than 6 GB available RAM. Deploy backend first, wait until healthy, then deploy frontend.

## Safe deployment sequence

1. Confirm at least 4 GB free disk and 3 GB available memory.
2. Deploy the backend image without running migrations inside the image build.
3. Run `npm run db:migrate` once in one backend container.
4. Verify `GET /health` and critical authenticated APIs.
5. Deploy the frontend and wait for its health check.
6. Keep the previous healthy container until the new container passes health checks.
7. Prune old build cache/images only through a scheduled maintenance policy, never during an active deployment.

If available memory is below 3 GB, stop and reschedule the build or build images in CI and deploy the prebuilt images. Swap is not a substitute for sufficient build memory, but 2–4 GB encrypted swap can protect the host from a transient spike.
