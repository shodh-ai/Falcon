# SGVU Biometric Hardware Discovery Checklist

Complete this checklist with University IT before deploying the on-prem listener.

## Device identification

- [ ] Biometric device brand/model confirmed (e.g. eSSL, ZKTeco, Matrix, other: __________)
- [ ] Number of devices and locations documented (gate, admin block, hostel, etc.)
- [ ] Device IDs or serial numbers mapped to Falcon `device_id` values (e.g. `MAIN_GATE_1`)

## Local software

- [ ] Is a local desktop application used to download punches? (e.g. eTimeTrackLite, BioTime, Matrix COSEC)
- [ ] Application name and version: __________
- [ ] Host PC OS and hostname: __________
- [ ] Does the app write to a local database or export file?

## Data source (choose one)

- [ ] MS SQL Server — server/instance: __________ database: __________ table/view: __________
- [ ] MySQL / MariaDB — host: __________ database: __________ table: __________
- [ ] SQLite file path: __________
- [ ] CSV / text log export path: __________
- [ ] Vendor REST/SDK API available? URL/docs: __________

## Employee ID mapping

- [ ] Confirm biometric `employee_id` matches `hr_employee_profiles.employee_id` in Falcon ERP
- [ ] Sample punch row attached (employee id, timestamp, device, direction if available)

## Network and security

- [ ] On-prem PC can reach Falcon cloud API over HTTPS (outbound 443)
- [ ] Static `X-API-KEY` issued and stored only in local `.env` and cloud env (never committed to git)
- [ ] Falcon entity id confirmed (`entity_id` query param, typically `1` for SGVU University)

## Handoff to developers

After IT completes the checklist, adapt the local listener data reader for the confirmed vendor/database. The cloud webhook endpoint is:

`POST /api/hr/biometrics/sync?entity_id=N`

Header: `X-API-KEY: <HR_BIOMETRIC_API_KEY>`

Payload (single punch):

```json
{
  "employee_id": "EMP-001",
  "punch_time": "2026-06-20T09:05:00Z",
  "device_id": "MAIN_GATE_1"
}
```
