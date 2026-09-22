# About this fork

This is Gloomr's fork of [`root-fr/jmap-webmail`](https://github.com/root-fr/jmap-webmail)
by Matthieu MALVACHE, used under the MIT licence. Upstream's copyright
notice and licence are kept intact in `LICENSE`.

## Branches

| Branch | Contents |
|---|---|
| `main` | a mirror of upstream. Nothing of ours is committed here. |
| `gloomr` | our work, rebased onto an upstream release tag. |

`gloomr` currently sits on **v1.7.3**.

Keeping `main` clean is what makes the rebase cheap and what keeps the
pull-request path to upstream open: a fix worth contributing is branched
from `main`, not from `gloomr`.

## What we changed

Nothing yet beyond this file and `.github/workflows/gloomr-ghcr.yml`.

Planned, each behind a flag so that an unconfigured build behaves
exactly like upstream:

- `MANAGED_SIGNATURES` — the signature field becomes read-only with a
  preview, and local template management is hidden.
- `COMPOSE_RENDER_URL` — the composer renders the letterhead, signature
  and footer around the message body, fetched from that URL and not
  editable in the composer.
- The shipped locales are reduced to `en` and `de`.

## Rebasing onto a new upstream release

Upstream releases often, so this is routine rather than an event.

```bash
git remote -v                      # `upstream` must point at root-fr/jmap-webmail
git fetch upstream --tags

# 1. Move `main` to upstream's, unchanged.
git checkout main
git merge --ff-only upstream/main
git push origin main

# 2. Replay our commits onto the new release tag.
git checkout gloomr
git rebase --onto v1.8.0 v1.7.3 gloomr

# 3. Verify before pushing — a rebase that compiles is not a rebase
#    that works.
npm ci
npm run typecheck
npm run lint
npx playwright test

git push --force-with-lease origin gloomr
```

`--force-with-lease`, never a bare `--force`: it refuses if someone
else moved the branch since the last fetch.

Then update the pin in the consuming repository so it names the new
commit, in the same change as any code that depends on it.

### Two files that should never conflict

`GLOOMR.md` and `.github/workflows/gloomr-ghcr.yml` do not exist
upstream, so a rebase cannot produce a conflict in them. If it does,
someone has edited an upstream file that should have been left alone —
find out which before resolving.

`.github/workflows/docker-publish.yml` is upstream's own and is left
byte-identical on purpose, for the same reason. It is disabled in this
repository's Actions settings rather than deleted: it publishes to a
Docker Hub namespace this organisation does not own, and a fork that
syncs `main` would otherwise get a failing run for it every time.
