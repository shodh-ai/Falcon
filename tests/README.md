# Falcon test suite — Phase A infrastructure

Enterprise testing scaffold for Falcon Campus OS. **No business workflow tests** in this phase.

## Quick start

```bash
cp .env.test.example .env.test
npm install
npm test
```

## Docs

See [../docs/TESTING_GUIDE.md](../docs/TESTING_GUIDE.md) for full installation, CI, coverage, and Phase B guidance.

## Layout

| Path | Purpose |
|------|---------|
| `unit/` | Jest unit smoke tests |
| `integration/` | Jest + Supertest + mocks |
| `e2e/` | Playwright config + specs |
| `helpers/` | Env, DB, auth, seed utilities |
| `fixtures/` | Static JSON fixtures |
| `factories/` | Object builders for tests |
| `mocks/` | External service + HTTP mocks |
| `scripts/` | Test DB migration runner |
