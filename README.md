# 🍴 FockNote

**Own your fockin' notes.**

A free, installable, git-backed personal notebook — "fork your own Notion." Every note is a
Markdown file in **your** repo, which makes it two things at once: your notebook, **and** a
shared workspace + memory that you and your coding agent both read and write. Capture from
anywhere — the FockNote PWA, Codex, Claude Code, or chat with a GitHub connector — and git
is the whole backend. GitHub Pages hosts the app shell. No server, no subscription, no
lock-in.

> 🧠 **Notes as a shared brain.** Point Codex, Claude Code, or any repo-aware agent at the
> repo and it reads your notes directly; drop in the memory bridge (`content/agent/` plus
> agent guidance such as `CLAUDE.md` or a Codex skill) and the agent curates the *best of
> your sessions* back as commits — visible, diffable, yours. See [`INTERFACE.md`](INTERFACE.md).

> 📖 **Full docs, guides & the agent setup skill:** **https://focknote.github.io**

## Set it up in 4 steps

1. **[Use this template](../../generate)** → create your notebook repo (name it anything).
2. Open `admin/config.yml` and set `backend.repo` to the repo that holds your notes
   (a separate **private** repo for private mode; **this** repo for a public garden).
3. **Settings → Pages →** deploy from branch `main`, folder `/ (root)`.
4. Open `https://<you>.github.io/<repo>/read/`, tap **Install app**, **Sign in with Token**,
   and write in place. The older `/admin/` Sveltia form stays available for bulk/admin
   work, but the main path is the read-and-edit app. Saving = a git commit.

> 💡 Even faster: ask **Codex or Claude Code** to run the FockNote skill — it does all of
> the above and hands you the live URL. See https://focknote.github.io.

## Private or public?

- **Private (default):** this public shell repo serves only code; your notes live in a
  **separate private repo** that Pages never serves. → app public, notes private, $0.
- **Public (knowledge garden):** keep notes in this same repo, shared on purpose.

Details, token scopes, and the privacy guarantee: **https://focknote.github.io**.

## What's in here

```
index.html            landing + service-worker registration + install button
manifest.json         PWA manifest (name, icons, standalone)
sw.js                 offline cache for the app shell + editor
read/                 main read + edit-in-place app with vendored Markdown libs
admin/                Sveltia power-admin fallback + pinned bundle
content/              your notes (Markdown) + media; content/agent/ = agent memory
assets/icons/         app icons
CLAUDE.md             Claude memory bridge — points Claude at content/agent/
.agents/skills/       Codex skill — teaches Codex the FockNote workflow
VENDOR.md             pinned Sveltia version + how to update
```

## License

[MIT](LICENSE). The vendored Sveltia CMS bundle is © its authors under its own license.
