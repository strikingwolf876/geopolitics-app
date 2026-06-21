# Vendored dependencies

## marked

- **File:** `read/vendor/marked.esm.js`
- **Package:** `marked`
- **Pinned version:** `12.0.2`
- **Source:** `https://cdn.jsdelivr.net/npm/marked@12.0.2/src/marked.min.js` (ESM build)

Used by the `/read/` reader to render Markdown → HTML.

## Turndown

- **File:** `read/vendor/turndown.browser.es.js`
- **Package:** `turndown`
- **Pinned version:** `7.2.4`
- **Source:** `https://cdn.jsdelivr.net/npm/turndown@7.2.4/lib/turndown.browser.es.js`

Used by the `/read/` in-place editor to serialize contenteditable HTML → Markdown on save.

### Re-vendoring Turndown

```sh
curl -sL https://cdn.jsdelivr.net/npm/turndown@<VERSION>/lib/turndown.browser.es.js \
  -o read/vendor/turndown.browser.es.js
```

Then bump the `CACHE` constant in `sw.js`.

---

## Sveltia CMS

- **File:** `admin/sveltia-cms.js`
- **Package:** `@sveltia/cms`
- **Pinned version:** `0.166.3`
- **Source:** https://unpkg.com/@sveltia/cms@0.166.3/dist/sveltia-cms.js

It is vendored (committed, same-origin) on purpose:

- **Reproducible** — the notebook can't break because a CDN moved.
- **Supply-chain safe** — pinned, reviewable, no runtime third-party fetch.
- **Offline** — the service worker caches a same-origin file; a CDN URL couldn't be.

### Re-vendoring (bump the version)

```sh
# pick the latest stable
curl -s https://registry.npmjs.org/@sveltia/cms/latest | grep -o '"version":"[^"]*"'

# download it
curl -sL https://unpkg.com/@sveltia/cms@<VERSION>/dist/sveltia-cms.js -o admin/sveltia-cms.js
```

Then bump:
- the version string in this file, and
- the `CACHE` constant in `sw.js` (e.g. `focknote-v1-sveltia-<VERSION>`) so old caches evict.

The FockNote skill does all of this for you when you ask it to update.
