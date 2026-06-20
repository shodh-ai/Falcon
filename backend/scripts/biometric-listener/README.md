# Falcon Biometric Listener

Deploy this script on the university's local Windows PC that can reach the biometric machines.

Before deployment, complete [`IT_DISCOVERY_CHECKLIST.md`](./IT_DISCOVERY_CHECKLIST.md) with University IT to confirm device vendor and local data source.

## Setup

1. Copy this folder to the on-prem machine (do not deploy inside the cloud repo runtime).
2. Copy `.env.example` to `.env` and configure:
   - `FALCON_API_URL` — your cloud Falcon API endpoint
   - `HR_BIOMETRIC_API_KEY` — must match backend env var `HR_BIOMETRIC_API_KEY`
   - `ENTITY_ID` — org entity (1=SGVU University, 2=World School, 3=Play School)
3. Point `BIOMETRIC_LOG_FILE` at the biometric export/log file, or adapt the reader after IT confirms the local database vendor.

## Cloud webhook contract

`POST /api/hr/biometrics/sync?entity_id=N`

Headers:

```
Content-Type: application/json
X-API-KEY: <HR_BIOMETRIC_API_KEY>
```

Single punch payload:

```json
{
  "employee_id": "EMP-001",
  "punch_time": "2026-06-20T09:05:00Z",
  "device_id": "MAIN_GATE_1"
}
```

Batch payload (used by this listener):

```json
{
  "punches": [
    {
      "employee_id": "EMP-001",
      "punch_time": "2026-06-20T09:05:00Z",
      "device_id": "MAIN_GATE_1",
      "punch_type": "IN"
    }
  ]
}
```

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

On Windows, schedule via Task Scheduler to run at login or as a background service.

The script polls every 5 minutes, deduplicates locally, and POSTs to `POST /api/hr/biometrics/sync?entity_id=N` with `X-API-KEY`.
