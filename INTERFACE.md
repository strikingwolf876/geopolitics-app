# FockNote as a Model-Human Interface

The companion to `ROADMAP.md`. The roadmap covers the **human UI** (reading +
editing). This covers the bigger idea: FockNote as a **Notion replacement where
the same Markdown is the shared workspace and memory for both you and repo-aware
agents such as Codex and Claude Code** — built entirely on top of GitHub's
existing integrations, so there's nothing bespoke to install.

## Thesis

Notion is a proprietary store with an API you must wire up. FockNote's store is
**a git repo**, and git/GitHub is *already* a first-class integration across modern
coding agents. So the model can read and write your notes through plumbing that
already exists — no custom backend, no Worker, no OAuth app, no MCP server to
stand up. Connect GitHub once and you're done. (For the nerdy Irish: own your
fockin' notes *and* your fockin' memory.)

## The interaction model (Path A — git-native)

Markdown files in the notes repo are the single source of truth. Every surface
reads or writes those same files; git history is the audit log.

### Read — everywhere, including chat
- **Chat + GitHub connector** — point a supported chat surface at the notes repo
  and ask about your notes directly in a conversation. No export, no copy-paste.
- **Web / PWA `/read/`** — the main human-facing read + edit-in-place app.
- **Codex, Claude Code, or any repo-aware coding agent** — reads files directly
  from a clone.

### Write — from any agent surface, or by hand
- **Local Codex or Claude Code** — edit `.md`, commit.
- **Remote / web coding agents** — same, from anywhere.
- **Chat-originated agent work** — direct commits today through repo-aware coding
  agents; PRs later if a chat surface exposes that mode.
- **FockNote `/read/`** — the main human read + edit-in-place app.
- **Sveltia `/admin/`** — power-admin fallback for list, bulk, and media workflows.

All of these land the same `.md` with the same frontmatter, so they coexist
(see `ROADMAP.md` → "Sveltia is not removed").

### Memory — notes are the shared brain
The notebook doubles as project memory, curated like Notion pages but in git:
- The model reads project context from the notes (not just a hidden store).
- The model writes updates back as commits — visible, diffable, reversible.
- **You** can see, edit, or delete anything the model "knows," in the same app.

## Why "no setup" (and the honest asterisks)

What you avoid vs a typical Notion-style integration: a custom API backend, a
Cloudflare Worker, an OAuth app, a hosted MCP server. What you still do **once**:
connect GitHub to the agent surface and grant access to the (possibly private)
notes repo. That's the whole setup.

Honest limits to design around:
- **Some chat GitHub connectors are read-only today.** Chat can *read* notes;
  *writing* goes through Codex, Claude Code, another repo-aware coding surface,
  or the web editors. FockNote saves are direct commits today; PRs are an
  optional future mode for chat-originated changes, not the current app path.
- **Private notes repo** needs the connector/token to have access — the one
  permission step.
- **Token-efficient recall** matters: with many notes the model shouldn't slurp
  everything. Lean on conventions below so recall is cheap.

## Conventions (so the model uses it well)

- **Index note** — a top-level `MEMORY`/`INDEX` note: one line per important note,
  so the model orients without reading the whole repo first.
- **Frontmatter** — `title`, `date`, `tags`; add `type` (e.g. `project`,
  `reference`, `decision`, `log`) so notes are retrievable by kind.
- **`[[wiki-links]]`** — a backlink graph (Phase 3) the model can traverse.
- **A dedicated collection** (e.g. `content/agent/` or `memory/`) for
  model-maintained notes, kept distinct from human notes but visible to both.
- **Provenance via git identity** — human commits and agent commits use distinct
  identities or subject prefixes, so the history shows who wrote what.

## Add it to a repo you already have

You don't need a whole notebook to get the memory half. Any existing repo — a
coding project, a docs repo — can adopt the bridge: drop in a `content/agent/`
folder (where the agent keeps the **best of your sessions**: decisions, context,
reference notes) and wire it into agent guidance such as `CLAUDE.md` or a Codex
skill. Now the agent carries that memory every session, and because it's just
Markdown in git it's **shareable** — push it and a friend who clones the repo gets
the same curated brain, diffable and reversible.

Two files do it: `content/agent/MEMORY.md` (the conventions) + `content/agent/INDEX.md`
(the index). For Claude, root `CLAUDE.md` is deliberately a thin block that only
*imports* the conventions; for Codex, `.agents/skills/focknote/SKILL.md` carries
the same workflow:

```markdown
<!-- focknote:memory:start -->
@content/agent/MEMORY.md
<!-- focknote:memory:end -->
```

**It won't fight your existing setup.** If the repo already has a `CLAUDE.md` full
of coding instructions, the bridge **appends** this marker block — it never
overwrites. Your build/style rules stay; memory layers on top. Remove it any time by
deleting the block + the `content/agent/` folder. A Codex skill can live beside
that bridge without changing Claude-specific setup.

## Optional bridge to tool-specific memory

Some tools have their own project memory or instruction stores that cannot simply
be redirected into this repo. To unify, two lightweight options (neither is
automatic):
- A tool-specific instruction telling the agent to treat the notebook's
  `agent/`/`memory/` collection as authoritative when working in the repo.
- A small sync that mirrors the hidden memory into the notebook (so it becomes
  human-visible notes) and back.

## Build order

1. Path A works **today** with no new code — use the repo as the shared store and
   keep the conventions above in the notes themselves.
2. Phase 1 `/read/` gives the human read view (shipped).
3. Phase 2 in-place editor writes the same Markdown/frontmatter as Sveltia
   (shipped).
4. Phase 3 links, backlinks, search, callouts, slash menu, new notes, daily
   notes, and inline date/tags are shipped.
5. Later: expose chat-side PRs as an optional mode once GitHub connectors support
   them; until then, capture + commit directly via Codex, Claude Code, or another
   repo-aware coding agent. Revisit Project-sync only if chat needs standing read
   access to notes.
