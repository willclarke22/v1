# MyWay V3.7A — Guarded experimental worktree foundation

**Scope:** This release creates a separate Git worktree/branch from the original HEAD and carries forward the matching latest V3.6 sandbox source files from the original working tree. It installs a source/config-only audit and a placeholder experimental environment template. It does **not** create an experimental Supabase project, Qdrant collection, Learning Space UI, or mock learning loop. Those are V3.7B–V3.8 tasks.

## Safety
- Original repo files are never edited by the installer; original uncommitted work remains in place.
- Expected V3.6 snapshot checksums are validated after newline normalization before any worktree change.
- The worktree is a different directory/branch. Shared Git repository metadata is necessarily updated by `git worktree add`.
- No secrets are copied, no HTTP/model calls occur, no DB/vector mutations occur, and no Next.js/worker services are started.
- The worktree is **not yet safe to start** with live production secrets. In particular, Qdrant query/upsert code still contains a hardcoded production collection name. Fix in V3.7B first.
- The supplied env template is deliberately inert: not named `.env.local`.
- Existing external Python services, asset libraries or secrets excluded by the attached dumps are not cloned.

## Install result
Expected experimental worktree: `C:\Users\willc\projects\MyWay\v1-learning-experiment`; branch `myway/learning-sandbox-v3_7a`; original remains `v1` on port 3000 if running. Port 3001 is planned but not started.

After completion, inspect `scripts/sandbox/v37a/readonly-audit.json` and `scripts/sandbox/v37a/installation.json` in the experimental worktree. A V3.7B patch should first verify the live SQL schema and Qdrant metadata, provision isolated stores, fix collection routing, then test writes exclusively in the experimental environment.

## Installation status meanings
- STATE 0: applicable; new worktree will be created.
- STATE 10: already installed; no changes.
- STATE 20: source drift, unsafe path, ambiguous branch/worktree, or incomplete installation; installer stops before changes when detected in preflight.

## Reverting setup
Do not use `git reset --hard` in the original checkout. If you want to remove the experiment, first preserve any independent work done there. Then explicitly use `git worktree remove <experimental path>` and optionally `git branch -D myway/learning-sandbox-v3_7a` after review. The installer deliberately does not do this automatically.


### V3.7A.1 clean-checkout correction (October 24, 2026)
Committing V3.6 before installation is supported. The launcher does NOT require any minimum
number of uncommitted or untracked changes. It verifies all 21 expected V3.6 source contents
in the original checkout and again in the newly created worktree. Only remaining uncommitted
allowlisted files are copied. A clean checkout is normal and is not a failure.
