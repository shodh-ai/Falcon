# Security Report — Phase F.4

| Unauthenticated → 401 | PASS | 401 |
| Faculty → President API blocked | PASS | 403 |
| President OwnerAccessGuard leadership inbox | PASS | 200 |

## RBAC

- President routes: `JwtAuthGuard` + `RolesGuard` (President, SuperAdmin)
- Leadership writes: `OwnerAccessGuard`
- Faculty blocked from President API (403/401)
