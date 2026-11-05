# MyWay S1.2.1 — narrow local Model C proxy compatibility hotfix

Cause: `proxy.ts` default-denied the new `POST /api/sandbox/probe-lab/local-assessment/memory-adjudicator` before the S1.2 route could reject malformed requests. HTTP 403 was the proxy's default denial, not the adjudicator response.

Scope:
- In the experimental worktree only, permit the **exact** path with **POST only**, **NODE_ENV=development**, and `MYWAY_EXPERIMENTAL_RUNTIME=v37b`.
- Retain host == localhost:3001/127.0.0.1:3001 and all original read-only V3.7C.1 routes, including default deny.
- Vercel/cloud branch remains FIRST; cloud policy blocks all API POST methods.
- S1.2 adjudicator still independently requires localhost Origin, valid input, approved model, and has no Supabase import or memory writes.
- Only tracked source edit is `proxy.ts`. S1.2 pointer and original `v1/main` are unchanged. This is an additive **overlay hotfix**, not a new current-local-release pointer, so S1.2's existing CLI and verifier remain compatible.
- No API calls, SQL, cron, Git writes or deployment during installation. Syntax/typecheck, route-guard simulation, S1.2 verifier and hash checks are run locally.
- Installation supports rollback to the exact original proxy using backed-up source bytes. Never reapply on an already changed worktree.

After installing, restart the *local* Next.js server on port 3001. Then, to run the no-cost malformed-request probe:

```
node scripts/sandbox/v37d2c7a3s121/probe-v37d2c7a3s121.mjs
```

Expected `S1.2.1 LOCAL ENDPOINT PROBE PASS: HTTP 400`. A 403 means runtime/env/Origin or proxy is still blocking; 404 means the new route is not mounted. Invalid `{}` is rejected before any provider call; this probe spends $0. Do not use the paid model run until probe passes.
