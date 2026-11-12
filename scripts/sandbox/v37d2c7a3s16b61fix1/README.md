# MyWay S61-FIX1 Stage Verification

This is a targeted research-only upgrade to the existing S61 longitudinal runner. It changes only two pinned S61 research files and adds support modules. It does NOT change S59, S60, the Learning Space, Supabase, Next.js routes, or the original v1/main worktree.

Use this verifier **after FIX1 installation**:

```powershell
node scripts/sandbox/v37d2c7a3s16b61fix1/verify-v37d2c7a3s16b61fix1.mjs
```

The original S61 stage verifier validates the original source hashes and therefore intentionally fails while FIX1 is installed. The new verifier validates the edited files against FIX1 hashes and checks the untouched original S61 files, the prior S60 verifier, both S61 and FIX1 self-tests, and source syntax. The installer separately invokes the *real* TypeScript baseline and post-install checks.

The fixture personalities are research-only hidden learner state: never pass them to A/B/C. All root, relationship, and teaching outcomes remain provisional. Model-E post-run reviewer (optional) is fallible and does not mutate memory. Completed technical scorecards must not be misread as independently proven tutoring efficacy.

Rollback requires the package and the pinned original backup created at installation. Do not manually overwrite versioned files or disable integrity checks.
