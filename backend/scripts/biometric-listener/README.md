# Falcon Biometric Listener

Deploy this script on the university's local Windows PC that can reach the biometric machines.

## Setup

1. Copy this folder to the on-prem machine.
2. Copy `.env.example` to `.env` and configure:
   - `FALCON_API_URL` — your cloud Falcon API endpoint
   - `HR_BIOMETRIC_WEBHOOK_SECRET` — must match backend env var
   - `ENTITY_ID` — org entity (1=SGVU University, 2=World School, 3=Play School)
3. Point `BIOMETRIC_LOG_FILE` at the biometric export/log file.

## Log format

One punch per line:

```
EMP001,2026-06-05T09:05:00+05:30,DEVICE-A,IN
EMP001,2026-06-05T17:02:00+05:30,DEVICE-A,OUT
```

## Run

```bash
node listener.js
```

On Windows, schedule via Task Scheduler to run at login or as a service.

The script polls every 5 minutes, deduplicates locally, and POSTs to `POST /api/hr/biometrics/sync?entity_id=N`.
