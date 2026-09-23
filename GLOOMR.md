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

Everything sits on `gloomr` and assumes the GLOOMR mail gateway between
this client and Stalwart — the same origin serves `/jmap/*` and
`/render/*`, and `lib/jmap/client.ts` exposes `gatewayFetch` for the
latter, under the signed-in user's credentials.

- **The composer writes inside the letter.**
  `components/email/letterhead-editor.tsx` fetches the frame — wordmark,
  headline, signature card, footer — from `POST /render/chrome` and
  drops it into the page as it is; the one writable cell is a
  `contentEditable` portaled into the frame's slot. The toolbar offers
  exactly what the document can hold, and a switch on its right draws
  the frame in the light or the dark palette: the mail carries both, and
  the reader's device chooses. A gateway that cannot be reached costs
  the picture, not the ability to write — the letterhead is applied on
  send, from the prose.
- **The message travels as a document.** `lib/letter-document.ts` reads
  the editor into a tree of headings, paragraphs, lists, quotes and
  links; the composer attaches it as
  `application/vnd.gloomr.richtext+json` (`.gloomr-body.json`) beside the
  prose, and the gateway renders the letter from it. A reply carries the
  thread as `{ attribution, text }`, which becomes a
  `<blockquote type="cite">` after the letter, outside its markup.
- **A conversation is fetched whole, and follows what happens next.**
  `getThreadEmails` asks for bodies, attachments and the threading
  headers, so the conversation view renders a message rather than its
  preview and a reply from it carries `In-Reply-To` and `References`.
  The open conversation is fetched again after a send and on every push,
  and replaced on screen only when a message or a flag differs
  (`conversationChanged` in `lib/thread-utils.ts`).
- **A row is a conversation.** `Email/query` collapses threads, so a page
  and its total count conversations, and the same request fetches the
  threads behind the rows (`Thread/get` → `Email/get` → `Mailbox/get`).
  The messages that sit in other mailboxes — the replies we sent — ride
  along as `siblings` (`lib/jmap/thread-siblings.ts`): they count, the
  newest shows, and the thread sorts by it, so a conversation moves up
  when it is answered. Trash, junk and drafts list only their own
  messages; a message that sits only in trash or junk stays out of an
  inbox conversation. Each message in the thread view names who it went
  to. The rows themselves are untouched, so paging
  anchors, the new-mail chime and the unified merge are as they were.
- **A row names who the conversation is with.** Senders oldest first, so
  the person who opened it comes first, and every address the reader
  sends from collapses into one "me" — a thread they just answered is
  not headed by their own signature. Replying to a message of their own
  writes to the people it was sent to, not back to themselves.
- **A draft is kept, and found where it belongs.** Closing the composer
  saves what was written; only "discard" throws it away, after asking.
  A draft travels with its conversation as a draft: listed in the row's
  expansion and shown in the thread view as a card in red
  (`DraftCard`), but not counted, not dating the conversation, not a
  participant (`describeThread` in `lib/thread-utils.ts`). A click on
  it — there, in the row, or in the Drafts folder — opens the composer
  seeded from it (`DraftSeed`), with the letter document read back from
  the attached `.gloomr-body.json` so headings and lists return, and
  the first save replaces the draft rather than adding a second one.
  Sending it takes it out of Drafts.
- **The application is light only.** `stores/theme-store.ts` applies the
  light theme, the appearance settings offer no choice, and the frame a
  table-shaped mail renders in pins `color-scheme: light` so a dark
  machine cannot paint a message dark inside a light page.
- **A reply shows the words written.** The history it quotes — cite
  blockquotes, Gmail's and Outlook's markers, the trailing `>` lines of
  a plain-text reply — folds behind a pill
  (`collapseQuotedHistory` in `lib/email-sanitization.ts`), and every
  preview a list or a card shows stops where the signature or the
  quote begins (`stripQuotedPreview`): the server cuts its preview from
  the text part, which carries both.
- **Links open away.** `lib/email-sanitization.ts` gives every http(s)
  link in a viewed mail `target="_blank" rel="noopener noreferrer"`.
- `.github/workflows/gloomr-ghcr.yml` publishes the image under the
  Gloomr organisation.

Still to do: the signature field made read-only (the gateway already
refuses `Identity/set` on `signature`), and the shipped locales reduced
to `en` and `de`.

## Rebasing onto a new upstream release

Upstream releases often, so this is routine rather than an event.

```bash
git remote -v                      # `upstream` must point at root-fr/jmap-webmail
git fetch upstream --tags

# 1. Move `main` to upstream's, unchanged.
git checkout main
git merge --ff-only upstream/main
git push origin main
# This is the push that first registers upstream's own
# docker-publish.yml as a workflow here — see below. Disable it in
# Settings › Actions straight afterwards, or it fails on every sync.

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
byte-identical on purpose, for the same reason. It publishes to a Docker
Hub namespace this organisation does not own, so it can only ever fail
here — but it is kept rather than deleted, because deleting it is a
change to an upstream file and every future rebase would have to
re-apply that deletion.

It is dormant while nothing pushes `main`: a fork does not inherit
upstream's workflow registrations, and this one does not appear in
Settings › Actions at all yet. The first `main` sync registers it, and
that is the moment to disable it — which is why the step is written into
the runbook above rather than left to be rediscovered from a red cross
on an otherwise routine sync.
