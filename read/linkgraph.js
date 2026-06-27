// Pure note-relationship graph builder — no DOM, no fetch, so it's unit-testable
// in isolation and reusable from reader.js at runtime.
//
// A note's outbound edges come from two sources:
//   - curated frontmatter [[slug]] targets in related: / used_by: / companion: / resource:
//   - relative Markdown .md links in the body, e.g. [text](../dir/note.md) or [text](note.md)
// Backlinks for a note are every other note whose outbound edges include it.

// [[target]] or [[target|label]] anywhere in a chunk of text.
export function wikiTargets(text) {
  const out = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(text || ''))) out.push(m[1].trim());
  return out;
}

// Relative .md Markdown links in a note body — e.g. [text](../doctrines/foo.md) or
// [text](foo.md). Excludes external URLs (http/mailto/etc), in-page anchors, and
// directory-only links (no .md suffix, e.g. ../ledger/) since those aren't note edges.
export function mdLinkTargets(body) {
  const out = [];
  const re = /\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body || ''))) {
    const href = (m[1] || '').trim();
    if (!/^[^:#]+\.md(#.*)?$/i.test(href)) continue;
    out.push(href.split('#')[0].split('/').pop().replace(/\.md$/i, ''));
  }
  return out;
}

// Frontmatter relationship fields that carry curated [[slug]] links.
export const RELATION_FIELDS = ['related', 'used_by', 'companion', 'resource'];

// Grabs a frontmatter field's value, including any indented/list continuation lines,
// stopping at the next top-level `key:` line. Handles both inline (`key: [[a]], [[b]]`)
// and block list (`key:\n  - "[[a]]"`) YAML forms.
export function fmFieldBlock(fmRaw, key) {
  const re = new RegExp(`^${key}:([^\\n]*(?:\\n(?![ \\t]*[\\w-]+:)[^\\n]*)*)`, 'm');
  const m = re.exec(fmRaw || '');
  return m ? m[0] : '';
}

// All [[slug]] targets across every curated relationship field in this note's frontmatter.
export function curatedWikiTargets(fmRaw) {
  const out = [];
  for (const key of RELATION_FIELDS) out.push(...wikiTargets(fmFieldBlock(fmRaw, key)));
  return out;
}

// lowercased filename slug + lowercased title → canonical note name (filename, no ext).
export function buildLinkIndex(notes) {
  const index = {};
  for (const n of notes) {
    index[n.name.toLowerCase()] = n.name;
    if (n.title) index[n.title.toLowerCase()] = n.name;
  }
  return index;
}

export function resolveAgainst(index, target) {
  return index[(target || '').trim().toLowerCase()] || null;
}

// This note's forward edges: curated frontmatter [[slug]]s + relative .md body links,
// resolved to canonical note names, deduped, self-excluded.
export function outboundOf(note, index) {
  const names = new Set();
  for (const t of curatedWikiTargets(note.fmRaw)) {
    const r = resolveAgainst(index, t);
    if (r && r !== note.name) names.add(r);
  }
  for (const t of mdLinkTargets(note.body)) {
    const r = resolveAgainst(index, t);
    if (r && r !== note.name) names.add(r);
  }
  return [...names];
}

// Every other note whose outbound edges point at `name`.
export function backlinksOf(notes, index, name) {
  return notes.filter((o) => o.name !== name && outboundOf(o, index).includes(name)).map((o) => o.name);
}
