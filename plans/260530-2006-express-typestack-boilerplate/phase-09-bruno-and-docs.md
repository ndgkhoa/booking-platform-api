# Phase 09 — Bruno Collection & Docs

**Priority:** Medium | **Status:** pending | **Depends:** 05

Hand-written Bruno API collection (committed, git-friendly) + project docs.

## Bruno collection — `/bruno`
Bruno stores requests as plain `.bru` files (version-controlled, unlike Postman). Structure:
```
bruno/
  bruno.json                 # collection manifest (name, version, type: collection)
  environments/
    local.bru                # vars: baseUrl=http://localhost:3000/api, token=
  auth/
    register.bru             # POST {{baseUrl}}/auth/register
    login.bru                # POST {{baseUrl}}/auth/login  -> post-response: bru.setEnvVar("token", res.body.data.token)
  users/
    me.bru                   # GET {{baseUrl}}/users/me   Authorization: Bearer {{token}}
    list.bru                 # GET {{baseUrl}}/users?page=1&limit=20
    by-id.bru
  health/
    health.bru               # GET http://localhost:3000/health
    metrics.bru              # GET http://localhost:3000/metrics
```
- `login.bru` uses a post-response script to capture `res.body.data.token` into env var `token`, so protected requests auto-authorize.
- Each request: add `docs` block + example assertions (`expect res.status to equal 200`).

Example `login.bru`:
```
meta { name: Login, type: http, seq: 2 }
post { url: {{baseUrl}}/auth/login, body: json, auth: none }
body:json { { "email": "admin@example.com", "password": "password123" } }
script:post-response { if (res.body?.data?.token) bru.setEnvVar("token", res.body.data.token); }
assert { res.status: eq 200 }
```

## Docs — `/docs`
Create per global doc-management rules:
- `docs/project-overview-pdr.md` — what/why, stack table, decisions (Express 4, tsc build, Postgres).
- `docs/system-architecture.md` — layering diagram (controller→service→repository), request lifecycle (security mw → interceptor → controller → error handler), DI container, mermaid diagram.
- `docs/code-standards.md` — path aliases, exception usage, response envelope contract, "no queries in services" rule.
- `docs/codebase-summary.md` — folder map + key files.
- `docs/deployment-guide.md` — env vars, migrations, Docker (Postgres+Redis), Docker required for tests, worker entry, graceful shutdown.
- `README.md` — quickstart (pnpm install, .env, migration:run, seed, dev), links to docs + `/api-docs` + bruno.

## Files
bruno/** , docs/** , README.md update.

## Todo
- [ ] bruno.json + local environment
- [ ] auth/users/health .bru requests with token capture script
- [ ] assertions + docs blocks per request
- [ ] docs/* (overview, architecture, standards, summary, deployment)
- [ ] README quickstart

## Success Criteria
- `bru run` (Bruno CLI) or GUI executes full flow: register → login (captures token) → me/list authorized.
- Docs reflect actual implementation; README gets a newcomer running in <5 min.
