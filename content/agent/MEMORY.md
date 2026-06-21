---
title: Memory conventions
date: 2026-06-16T00:00:00.000Z
type: reference
tags:
  - meta
  - memory
---

# FockNote memory — how Claude uses this folder

`content/agent/` is **model-maintained memory**, kept distinct from human notes but
visible to both (humans edit the same files in the `/admin/` CMS). Git history is
the audit log. Treat it as authoritative.

## Where memory lives

- `content/agent/` — your memory. Read and write here.
- `content/agent/INDEX.md` — the **index note**: one line per important memory.
  Read this *first* to orient. Don't slurp everything — follow the index, then open
  only the notes you need.
- `content/notes/` — human notes. Read for context; don't overwrite unless asked.

## Reading

1. Open `content/agent/INDEX.md`.
2. Follow its lines (and any `[[wiki-links]]`) to the specific notes you need.
3. Only then read human notes in `content/notes/` if more context is required.

## Writing memory

When you learn something worth persisting, write a note in `content/agent/`:

- **Frontmatter** every note: `title`, `date` (ISO), `tags`, and `type` — one of
  `project`, `reference`, `decision`, `log`. `type` makes notes retrievable by kind.
- **One fact / topic per note.** Keep them small so recall stays cheap.
- **Link** related notes with `[[note-slug]]` (filename without `.md`).
- **Update `INDEX.md`**: add/refresh a one-line pointer `- [[note-slug]] — short hook`.
  Never put note bodies in the index.
- Before creating, check `INDEX.md` for an existing note that covers it — update that
  note instead of duplicating. Delete notes that turn out wrong.

Example note `content/agent/db-choice.md`:

```markdown
---
title: DB choice
date: 2026-06-16T00:00:00.000Z
type: decision
tags: [infra]
---

Use Postgres over SQLite — need concurrent writers. See [[deploy-target]].
```

## Committing (provenance)

Memory changes are visible, diffable, reversible commits. Use a distinct Claude
identity so history shows who wrote what. Commit memory edits separately from code
or human-note changes; subject like `memory: add db-choice`.
