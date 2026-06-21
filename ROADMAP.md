# FockNote Front-End Roadmap

Internal dev plan for the "fork-your-own-Notion" front-end track. The MVP
(Sveltia CMS admin + PWA shell + git backend) shipped; this roadmap covers the
reading/editing experience layered on top.

## Why this exists

Sveltia's `/admin/` is a **form CMS by design** — Title/Date/Tags/Body fields.
It will never feel like Notion for *editing*, and the template shipped **no
front-end reader at all**, so notes could only be viewed inside the admin form.
The gap people feel vs Notion is really "no nice reader + a 90s-looking edit
form." This track closes it in phases, without breaking FockNote's core ethos:
**no build step, vendored single files, offline-capable, git as the backend.**

## Phase 1 — Reading view ✅ (built)

A clean, Notion-ish read page at `/read/`.

- `read/index.html` — shell + sticky top bar, registers the root service worker.
- `read/reader.css` — dark theme: big inline title, subtle date/tag **chips**
  (no labels, no asterisks, no form), real body typography.
- `read/reader.js` — reads `admin/config.yml` for the notes repo, reuses the CMS
  PAT from `localStorage['sveltia-cms.user'].token` (fallback: own prompt →
  `localStorage['focknote.token']`), lists + fetches notes via the GitHub API,
  UTF-8-safe base64 decode, frontmatter parse, hash router (list ↔ note). Each
  note has an ✎ Edit button deep-linking into Sveltia.
- `read/vendor/marked.esm.js` — vendored `marked@12.0.2` (Markdown → HTML),
  stays offline.
- `sw.js` precaches `read/*` (cache bumped `v3` → `v4`); landing page leads with
  **Read notes**.

**Fixed bug (keep in mind):** the config parser must be line-anchored
(`/^\s*repo:\s*([^\s#]+)/m`, same for `branch`). A naive `repo:\s*…` also matches
the word `repo:` inside a `config.yml` comment, captures garbage, and produces a
malformed `api.github.com` URL → "NetworkError" in the browser.

Phase 1 is stack-agnostic and ships regardless of the editor choice below.

## Phase 2 — Edit in place (SHIPPED 2026-06-16)

**Status:** built + working (`read/reader.js`, commit `198336a`). Required pieces
1–4 below are done: `marked` render, `contenteditable` body + inline title, vendored
**Turndown** (`read/vendor/turndown.browser.es.js`) for HTML→Markdown on save, and
Contents API `PUT` (sha + base64 + rebuilt frontmatter, 401/403 handled, ✎ Edit /
✓ Save / ✕ Cancel FABs). Deferred to Phase 3: slash menu / callouts / drag, plus
date/tags **editing** (currently preserved on save, not yet editable inline). Known
residual risk = HTML↔Markdown round-trip fidelity on nested lists / code blocks /
pasted content — acceptable for v1.

Kill the form. One page that renders by default; an **Edit** toggle flips the
body to editable. Save commits the `.md` straight to the notes repo via the
GitHub Contents API (`PUT`, same PAT). Title becomes an inline heading;
date/tags become inline chips. No labels, no asterisks, no date-picker box.

**Sveltia is not removed.** This is additive: `/admin/` stays as the power
admin (list, bulk ops, media uploads) and as a fallback. Both editors write the
**same `.md` files** in the same notes repo with the same frontmatter
(`title`/`date`/`tags`/`body`), so they coexist with no data split — just keep
the custom editor's Markdown serialization close to Sveltia's to avoid
whitespace/escaping churn when a note is bounced between the two.

**Editor stack — decided: `contenteditable` + the already-vendored `marked`.**
Not Milkdown / TipTap. Those are excellent but are multi-package, bundler-first
(big ProseMirror dependency graph); on a no-build/vendored/offline site they
fight the single-file ethos. `contenteditable` + `marked` stays one file and
offline. Slash menu / callouts are added later as small custom pieces.

Required pieces:

1. Render Markdown → HTML — `marked` (done).
2. Editable body + inline title/chips — `contenteditable`.
3. **Serialize HTML → Markdown on save** — needs a second vendored lib
   (Turndown-style). `marked` only goes one direction. *New dependency.*
4. Commit — Contents API `PUT` (sha + base64 + rebuild frontmatter); mirror of
   the read path. Needs a write-scoped token.
5. Slash menu / callouts / drag — later, not v1.

**Effort: medium (~1–2 focused sessions to "good enough to replace the form").**
The real risk is HTML↔Markdown **round-trip fidelity** — `contenteditable`
produces messy HTML; a Turndown pass cleans most, but nested lists, code blocks,
and pasted content are edge cases. v1 will be good with rough edges.

*Cheaper alternative* if round-trip fidelity proves too painful: a CodeMirror
Markdown editor with live preview (split/toggle) instead of true WYSIWYG — much
less round-trip risk, slightly less "in-place" feel.

## Phase 3 — Extras (SHIPPED — 2026-06-16)

All shipped in `read/reader.js`, Edge-verified (Playwright), zero console errors:
- **`[[wiki-links]]`** (`e70cc14`) — inline `marked` extension → in-app links,
  `.broken` for unresolved, Turndown rule round-trips them back to `[[..]]`.
- **Backlinks** (`e70cc14`) — "Linked from" on each note.
- **Search** (`e70cc14`) — client-side over title/tags/body (notes cache + link index).
- **Callouts** (`fa358fd`) — `marked` block extension for `> [!type]` blockquotes +
  Turndown rule (round-trips to `[!type]` syntax), styled per type.
- **Slash menu** (`fa358fd`) — type `/` in the editor: headings, lists, quote, code,
  divider, callouts; arrow/enter/click + live filter.
- **New note** (`+ New`) and **daily note** (`Today`) (`fa358fd`) — `createNote` PUTs a
  fresh slugged `.md`, opens it in edit mode.
- **Inline date + tags editing** (`fa358fd`) — date input + comma-list in the props row.

Possible future polish: live `[[link]]` autocomplete in the editor, drag-reorder,
image paste/upload, true offline reading.

## Chat / GitHub write path

The human-facing app work is shipped. The remaining integration question is how
chat-originated writes should land in git without adding custom backend
infrastructure. FockNote's shipped app path is straight commits through the
GitHub Contents API; PRs are only an optional future chat-agent mode.

- [x] Keep the app write path as direct commits.
- [ ] Add a PR-vs-direct-commit switch only if/when a chat connector supports
      chat-originated PRs cleanly.
- [ ] Until then: capture + commit directly via Codex, Claude Code, or another
      repo-aware coding agent.
- [ ] Revisit Project-sync if chat needs standing read access to notes.

## Dev / sync loop (Phase 2 prerequisite)

Phase 2 means many iterate → deploy → test cycles against a live instance.
Doing that with ad-hoc tokens, web-edits, and per-file API pushes is untenable,
so a frictionless template → instance deploy loop is a prerequisite.

- **`focknote/focknote`** — template / source of truth. Auth: SSH alias
  `gh-focknote`.
- **A live test instance** (the maintainer's own notebook) — auth: a second SSH
  user key + alias `gh-striking` (account-level key covers the shell repo and
  its private notes repo).
- **Local dev clones** on the maintainer's machine; the end user only ever uses
  the deployed web app.

**Sync model — shell flows template → instance; never clobber instance files.**

- *Shell* (sync/push): `index.html`, `sw.js`, `admin/index.html`,
  `admin/sveltia-cms.js`, `manifest.json`, `assets/icons/*`, `read/*`. Bump the
  SW `CACHE` name on any shell change.
- *Instance-only* (never overwrite): `admin/config.yml` (its `repo:` points at
  the instance's notes repo) and `content/` (notes live in the separate notes
  repo anyway).

A small `sync-shell` helper script will automate the copy + commit + push.

## Tooling idea — Playwright MCP

Drive the real browser against the live notebook (sign in, open the editor,
type, save, screenshot, confirm the commit landed). Automates the deploy → test
verification loop that today is manual — and catches exactly the class of bugs
(NetworkError, stale service-worker cache) that only show up when a real page
loads. Needs an MCP server in config; the sign-in PAT must be handled as a
secret, and tests should force a service-worker unregister/hard-reload to avoid
stale caches. Worth setting up once the sync loop is live.
