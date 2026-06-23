// FockNote reading + editing view.
// No build step: plain ESM + vendored Markdown renderer + HTML→MD serializer.
import { marked } from './vendor/marked.esm.js';
import TurndownService from './vendor/turndown.browser.es.js';

marked.setOptions({ gfm: true, breaks: false });
const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });

// ── [[wiki-links]] ─────────────────────────────────────────────────────────────
// marked inline extension: [[target]] or [[target|label]] → an in-app note link.
marked.use({ extensions: [{
  name: 'wikiLink', level: 'inline',
  start(src) { const i = src.indexOf('[['); return i < 0 ? undefined : i; },
  tokenizer(src) {
    const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src);
    if (!m) return;
    return { type: 'wikiLink', raw: m[0], target: m[1].trim(), label: (m[2] || m[1]).trim() };
  },
  renderer(tok) {
    const name = resolveLink(tok.target);
    const cls = name ? 'wikilink' : 'wikilink broken';
    const href = name ? `#/note/${encodeURIComponent(name)}` : '#/';
    const tip = name ? '' : ` title="No note named ${esc(tok.target)}"`;
    return `<a class="${cls}" href="${href}" data-wikitarget="${esc(tok.target)}"${tip}>${esc(tok.label)}</a>`;
  },
}] });

// Turndown: serialize wiki-link anchors back to [[target]] / [[target|label]] so an
// edit→save round-trip never corrupts the link into a normal Markdown link.
td.addRule('wikilink', {
  filter: (node) => node.nodeName === 'A' && node.classList && node.classList.contains('wikilink'),
  replacement: (content, node) => {
    const target = node.getAttribute('data-wikitarget') || content;
    return content && content !== target ? `[[${target}|${content}]]` : `[[${target}]]`;
  },
});

// ── Callouts ───────────────────────────────────────────────────────────────────
// Obsidian/GitHub style: a blockquote whose first line is `[!type] optional title`.
const CALLOUT_ICON = { note: '📝', info: 'ℹ️', tip: '💡', warning: '⚠️', danger: '🚨', success: '✅', question: '❓' };
marked.use({ extensions: [{
  name: 'callout', level: 'block',
  start(src) { const m = src.match(/^> *\[!/m); return m ? m.index : undefined; },
  tokenizer(src) {
    const m = /^> *\[!(\w+)\][ \t]*(.*)(?:\n|$)((?:>.*(?:\n|$))*)/.exec(src);
    if (!m) return;
    const inner = (m[3] || '').replace(/^>[ \t]?/gm, '').replace(/\s+$/, '');
    const tok = { type: 'callout', raw: m[0], calloutType: m[1].toLowerCase(), title: m[2].trim(), tokens: [] };
    this.lexer.blockTokens(inner, tok.tokens);
    return tok;
  },
  renderer(tok) {
    const type = tok.calloutType;
    const def = type.charAt(0).toUpperCase() + type.slice(1);
    const icon = CALLOUT_ICON[type] || '📌';
    const body = this.parser.parse(tok.tokens);
    return `<div class="callout callout-${esc(type)}" data-callout="${esc(type)}">`
      + `<div class="callout-title"><span class="callout-ico">${icon}</span> ${esc(tok.title || def)}</div>`
      + `<div class="callout-body">${body}</div></div>`;
  },
}] });

// ── Relative .md links ──────────────────────────────────────────────────────────
// Knowledge-base notes cross-reference each other with plain Markdown links like
// [imperial overstretch](imperial-overstretch.md) or [foo](cases/foo.md), not
// [[wikilinks]]. The default renderer leaves the href as a relative path, which the
// browser resolves against /read/ (a hash router) and 404s. Resolve the bare filename
// against the note index instead; only fall through to a normal link for anything that
// isn't a relative .md reference (http(s), mailto, anchors, etc).
marked.use({ renderer: {
  link(href, title, text) {
    if (!/^[^:#]+\.md(#.*)?$/i.test(href || '')) {
      const out = `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener">${text}</a>`;
      return out;
    }
    const base = href.split('#')[0].split('/').pop().replace(/\.md$/i, '');
    const name = resolveLink(base);
    const cls = name ? 'wikilink' : 'wikilink broken';
    const linkHref = name ? `#/note/${encodeURIComponent(name)}` : '#/';
    const tip = name ? '' : ` title="No note named ${esc(base)}"`;
    return `<a class="${cls}" href="${linkHref}" data-wikitarget="${esc(base)}"${tip}>${text}</a>`;
  },
} });

// Turndown: callout <div> → `> [!type] title` + quoted body (round-trip safe).
td.addRule('callout', {
  filter: (node) => node.nodeType === 1 && node.classList && node.classList.contains('callout'),
  replacement: (content, node) => {
    const type = node.getAttribute('data-callout') || 'note';
    const def = type.charAt(0).toUpperCase() + type.slice(1);
    const titleEl = node.querySelector('.callout-title');
    const bodyEl = node.querySelector('.callout-body');
    const rawTitle = titleEl ? titleEl.textContent.replace(/^[^\w]*/, '').trim() : '';
    const title = rawTitle && rawTitle.toLowerCase() !== def.toLowerCase() ? ' ' + rawTitle : '';
    const bodyMd = bodyEl ? td.turndown(bodyEl.innerHTML).trim() : '';
    const quoted = bodyMd ? '\n' + bodyMd.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n') : '';
    return `\n\n> [!${type}]${title}${quoted}\n\n`;
  },
});

const app = document.getElementById('app');
const API = 'https://api.github.com';

// ── Token ────────────────────────────────────────────────────────────────────
function getToken() {
  try {
    const u = JSON.parse(localStorage.getItem('sveltia-cms.user') || 'null');
    if (u && u.token) return u.token;
  } catch {}
  return localStorage.getItem('focknote.token') || '';
}
function setToken(t) { localStorage.setItem('focknote.token', t); }

// ── Config ───────────────────────────────────────────────────────────────────
async function loadConfig() {
  const res = await fetch('../admin/config.yml', { cache: 'no-cache' });
  if (!res.ok) throw new Error('config.yml not found');
  const text = await res.text();
  // Line-anchored so we match the real YAML keys, not a `repo:` mentioned in a comment.
  const repo = (text.match(/^\s*repo:\s*([^\s#]+)/m) || [])[1] || '';
  const branch = (text.match(/^\s*branch:\s*([^\s#]+)/m) || [])[1] || 'main';
  return { repo, branch };
}

// ── GitHub helpers ────────────────────────────────────────────────────────────
async function gh(path, token) {
  const res = await fetch(API + path, {
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 401) { const e = new Error('Bad or expired token'); e.code = 401; throw e; }
  if (res.status === 404) { const e = new Error('Not found'); e.code = 404; throw e; }
  if (!res.ok) throw new Error('GitHub API ' + res.status);
  return res.json();
}

async function ghPut(path, token, payload) {
  const res = await fetch(API + path, {
    method: 'PUT',
    headers: {
      Authorization: 'token ' + token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) { const e = new Error('Bad or expired token'); e.code = 401; throw e; }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const e = new Error('GitHub ' + res.status + (j.message ? ': ' + j.message : ''));
    e.code = res.status;
    throw e;
  }
  return res.json();
}

function decodeB64(b64) {
  const bin = atob((b64 || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ── Frontmatter ───────────────────────────────────────────────────────────────
// This notebook's frontmatter isn't the FockNote default (title/date/tags) — it's the
// knowledge-base schema (knowledge/{cases,people,doctrines,ledger,sources}), where the
// "title" field is sometimes `actor` (ledger) and the "date" field is `timestamp`. We
// detect which key each note actually uses, and patch only that key on save so the
// rest of the frontmatter (resource, status, confidence, type, …) survives untouched.
function parseNote(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fmRaw: '', titleKey: 'title', dateKey: 'date', title: '', date: '', tags: [], body: raw };
  const fm = m[1], body = m[2];
  const titleKey = /^title:/m.test(fm) ? 'title' : (/^actor:/m.test(fm) ? 'actor' : 'title');
  const dateKey = /^timestamp:/m.test(fm) ? 'timestamp' : (/^date:/m.test(fm) ? 'date' : 'timestamp');
  const title = (fm.match(new RegExp(`^${titleKey}:\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
  const date = (fm.match(new RegExp(`^${dateKey}:\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
  let tags = [];
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
  if (inline) {
    tags = inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  } else {
    const block = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (block) tags = block[1].split('\n').map((l) => (l.match(/-\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return { fmRaw: fm, titleKey, dateKey, title, date, tags, body };
}

// Patch only title/date/tags lines inside the ORIGINAL frontmatter block, leaving every
// other field (resource, status, confidence, type, author, …) byte-for-byte intact.
function patchFm(fmRaw, { titleKey, title, dateKey, date, tags }) {
  let fm = fmRaw;
  const titleLine = `${titleKey}: "${title.replace(/"/g, '\\"')}"`;
  fm = new RegExp(`^${titleKey}:.*$`, 'm').test(fm)
    ? fm.replace(new RegExp(`^${titleKey}:.*$`, 'm'), titleLine)
    : `${titleLine}\n${fm}`;
  const dateLine = `${dateKey}: "${date}"`;
  fm = new RegExp(`^${dateKey}:.*$`, 'm').test(fm)
    ? fm.replace(new RegExp(`^${dateKey}:.*$`, 'm'), dateLine)
    : `${fm}\n${dateLine}`;
  const tagsLine = `tags: [${tags.join(', ')}]`;
  if (/^tags:\s*\n(?:\s*-\s*.+\n?)+/m.test(fm)) fm = fm.replace(/^tags:\s*\n(?:\s*-\s*.+\n?)+/m, `${tagsLine}\n`);
  else if (/^tags:.*$/m.test(fm)) fm = fm.replace(/^tags:.*$/m, tagsLine);
  else fm = `${fm}\n${tagsLine}`;
  return `---\n${fm}\n---\n`;
}

function buildNewFm({ title, date, tags }) {
  return `---\ntype: case\ntitle: "${title.replace(/"/g, '\\"')}"\ntags: [${tags.join(', ')}]\nstatus: draft\ntimestamp: "${date}"\n---\n`;
}

function fmtDate(d) {
  if (!d) return '';
  const t = new Date(d);
  if (isNaN(t)) return d;
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── State ─────────────────────────────────────────────────────────────────────
let CFG = null;
let TOKEN = '';
let NOTE = null;       // current open note { name, path, sha, title, date, tags, body }
let NOTES = [];        // cache of all notes — powers search + the [[link]] graph
let LINK_INDEX = {};   // lowercased name/title → canonical note name

function resolveLink(target) {
  return LINK_INDEX[(target || '').trim().toLowerCase()] || null;
}
function wikiTargets(body) {
  const out = []; const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g; let m;
  while ((m = re.exec(body || ''))) out.push(m[1].trim());
  return out;
}
// Folders are discovered at runtime (git tree, below) — nothing here is hardcoded, so any
// new knowledge/** subfolder (e.g. a new official-docs category) shows up with zero code
// changes. Sveltia CMS itself still needs one `collections:` entry per folder in
// admin/config.yml to make a folder *editable/creatable* there — that's a CMS tool
// limitation (no nested/dynamic collections yet), not something this reader controls.
// Singleton files (Sveltia `files:` collection, not a folder) — done/todo receipt logs.
const SINGLE_FILES = ['knowledge/todo-receipts.md', 'knowledge/done-receipts.md'];
const folderLabel = (folder) => (folder || '').replace(/^knowledge\//, '');

async function loadAllNotes() {
  // One recursive tree call discovers every .md under knowledge/** — no folder list to maintain.
  const tree = await gh(`/repos/${CFG.repo}/git/trees/${CFG.branch}?recursive=1`, TOKEN);
  const singleSet = new Set(SINGLE_FILES);
  const files = (tree.tree || [])
    .filter((f) => f.type === 'blob' && f.path.startsWith('knowledge/') && f.path.endsWith('.md')
      && f.path.split('/').pop() !== 'TEMPLATE.md' && !singleSet.has(f.path))
    .map((f) => ({ name: f.path.split('/').pop(), path: f.path, folder: f.path.slice(0, f.path.lastIndexOf('/')) }));
  SINGLE_FILES.forEach((path) => files.push({ name: path.split('/').pop(), path, folder: 'receipts' }));
  NOTES = await Promise.all(files.map(async (f) => {
    const [data, commits] = await Promise.all([
      gh(`/repos/${CFG.repo}/contents/${f.path}?ref=${CFG.branch}`, TOKEN),
      // Last commit touching this file = true "last updated", unlike the frontmatter
      // date/timestamp which is the event date and often shared across a whole ingest batch.
      gh(`/repos/${CFG.repo}/commits?path=${encodeURIComponent(f.path)}&sha=${CFG.branch}&per_page=1`, TOKEN).catch(() => []),
    ]);
    const updated = commits[0]?.commit?.committer?.date || null;
    return { name: f.name.replace(/\.md$/, ''), path: f.path, folder: f.folder, sha: data.sha, updated, ...parseNote(decodeB64(data.content)) };
  }));
  NOTES.sort((a, b) => new Date(b.updated || b.date || 0) - new Date(a.updated || a.date || 0));
  LINK_INDEX = {};
  for (const n of NOTES) {
    LINK_INDEX[n.name.toLowerCase()] = n.name;
    if (n.title) LINK_INDEX[n.title.toLowerCase()] = n.name;
  }
  return NOTES;
}
async function ensureNotes() {
  if (!NOTES.length) await loadAllNotes();
  return NOTES;
}

let PENDING_EDIT = false; // enter edit mode right after the next note render (new/daily notes)

// ── Note creation (new note + daily note) ──────────────────────────────────────
const slugify = (s) => (s || '').toLowerCase().trim()
  .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const todayISO = () => new Date().toISOString();
const datePart = (iso) => (iso ? String(iso).slice(0, 10) : '');

async function createNote({ title, date, tags = [], body = '' }) {
  const d = date || todayISO();
  const base = `${datePart(d)}-${slugify(title) || 'untitled'}`;
  let name = base, i = 2;
  while (NOTES.some((x) => x.name === name)) name = `${base}-${i++}`;
  const folder = 'knowledge/cases';
  const path = `${folder}/${name}.md`;
  const raw = buildNewFm({ title, date: d, tags }) + body + '\n';
  const result = await ghPut(`/repos/${CFG.repo}/contents/${path}`, TOKEN,
    { message: `create: ${title}`, content: encodeB64(raw), branch: CFG.branch });
  const note = { name, path, folder, sha: result.content.sha, titleKey: 'title', dateKey: 'timestamp', title, date: d, tags, body };
  NOTES.unshift(note);
  LINK_INDEX[name.toLowerCase()] = name;
  if (title) LINK_INDEX[title.toLowerCase()] = name;
  return name;
}

function handleWriteErr(e) {
  if (e.code === 401) { askToken(); return; }
  alert(e.code === 403 ? 'Failed (403) — your token needs Contents: write access.' : 'Failed: ' + e.message);
}

async function newNote() {
  const title = prompt('New note title:');
  if (title == null) return;
  try {
    const name = await createNote({ title: title.trim() || 'Untitled', date: todayISO(), tags: [] });
    PENDING_EDIT = true;
    location.hash = `#/note/${encodeURIComponent(name)}`;
  } catch (e) { handleWriteErr(e); }
}

async function openDaily() {
  await ensureNotes();
  const dp = datePart(todayISO());
  const existing = NOTES.find((x) => (x.tags || []).includes('daily') && datePart(x.date) === dp);
  if (existing) { location.hash = `#/note/${encodeURIComponent(existing.name)}`; return; }
  const title = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  try {
    const name = await createNote({ title, date: todayISO(), tags: ['daily'] });
    PENDING_EDIT = true;
    location.hash = `#/note/${encodeURIComponent(name)}`;
  } catch (e) { handleWriteErr(e); }
}

// ── Props (date + tags), view + inline edit ────────────────────────────────────
function propsView(n) {
  const chips = [];
  if (n.date) chips.push(`<span class="chip"><span class="k">📅</span> ${esc(fmtDate(n.date))}</span>`);
  (n.tags || []).forEach((t) => chips.push(`<a class="chip chip-tag" href="${hashFor(t, null)}"><span class="k">🏷</span> ${esc(t)}</a>`));
  return chips.join('');
}
function propsEdit(n) {
  return `<input class="prop-date" type="date" value="${esc(datePart(n.date))}" aria-label="Date">
    <input class="prop-tags" type="text" value="${esc((n.tags || []).join(', '))}" placeholder="tags, comma, separated" aria-label="Tags">`;
}

// ── Slash menu (type "/" in the editor body) ───────────────────────────────────
function insertHTMLBlock(html) { document.execCommand('insertHTML', false, html); }
function insertCallout(type) {
  const def = type.charAt(0).toUpperCase() + type.slice(1);
  const icon = CALLOUT_ICON[type] || '📌';
  insertHTMLBlock(`<div class="callout callout-${type}" data-callout="${type}"><div class="callout-title"><span class="callout-ico">${icon}</span> ${def}</div><div class="callout-body"><p>&nbsp;</p></div></div><p><br></p>`);
}
const SLASH_ITEMS = [
  { key: 'h1', label: 'Heading 1', hint: 'H1', run: () => document.execCommand('formatBlock', false, 'H1') },
  { key: 'h2', label: 'Heading 2', hint: 'H2', run: () => document.execCommand('formatBlock', false, 'H2') },
  { key: 'h3', label: 'Heading 3', hint: 'H3', run: () => document.execCommand('formatBlock', false, 'H3') },
  { key: 'bullet', label: 'Bullet list', hint: '•', run: () => document.execCommand('insertUnorderedList') },
  { key: 'number', label: 'Numbered list', hint: '1.', run: () => document.execCommand('insertOrderedList') },
  { key: 'quote', label: 'Quote', hint: '❝', run: () => document.execCommand('formatBlock', false, 'BLOCKQUOTE') },
  { key: 'code', label: 'Code block', hint: '</>', run: () => insertHTMLBlock('<pre><code>code</code></pre><p><br></p>') },
  { key: 'divider', label: 'Divider', hint: '―', run: () => document.execCommand('insertHorizontalRule') },
  { key: 'note callout', label: 'Callout: Note', hint: '📝', run: () => insertCallout('note') },
  { key: 'tip callout', label: 'Callout: Tip', hint: '💡', run: () => insertCallout('tip') },
  { key: 'warning callout', label: 'Callout: Warning', hint: '⚠️', run: () => insertCallout('warning') },
];
let SLASH = null; // { menu, query, items, active }

function openSlash() {
  closeSlash();
  const menu = document.createElement('div');
  menu.className = 'slash-menu';
  document.body.appendChild(menu);
  SLASH = { menu, query: '', items: SLASH_ITEMS.slice(), active: 0 };
  positionSlash();
  drawSlash();
}
function closeSlash() { if (SLASH) { SLASH.menu.remove(); SLASH = null; } }
function positionSlash() {
  if (!SLASH) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let r = sel.getRangeAt(0).getBoundingClientRect();
  if (!r || (!r.left && !r.top)) {
    const b = document.querySelector('.note .body');
    r = b ? b.getBoundingClientRect() : { left: 40, bottom: 120 };
  }
  SLASH.menu.style.left = Math.round(r.left) + 'px';
  SLASH.menu.style.top = Math.round((r.bottom || r.top) + window.scrollY + 6) + 'px';
}
function drawSlash() {
  if (!SLASH) return;
  const q = SLASH.query.toLowerCase();
  SLASH.items = SLASH_ITEMS.filter((it) => it.label.toLowerCase().includes(q) || it.key.includes(q));
  if (SLASH.active >= SLASH.items.length) SLASH.active = 0;
  SLASH.menu.innerHTML = SLASH.items.length
    ? SLASH.items.map((it, i) => `<div class="slash-item${i === SLASH.active ? ' active' : ''}" data-i="${i}"><span class="slash-hint">${esc(it.hint)}</span> ${esc(it.label)}</div>`).join('')
    : `<div class="slash-empty">no match</div>`;
  SLASH.menu.querySelectorAll('.slash-item').forEach((el) => {
    el.onmousedown = (e) => { e.preventDefault(); chooseSlash(+el.dataset.i); };
  });
}
function chooseSlash(i) {
  if (!SLASH) return;
  const it = SLASH.items[i];
  const qlen = SLASH.query.length;
  closeSlash();
  const sel = window.getSelection();
  for (let k = 0; k < qlen + 1; k++) sel.modify('extend', 'backward', 'character'); // grab "/query"
  document.execCommand('delete');
  if (it) it.run();
}
function onBodyInput(e) {
  if (SLASH) {
    if (e.inputType === 'insertText' && e.data && e.data !== ' ') { SLASH.query += e.data; drawSlash(); positionSlash(); return; }
    if (e.inputType === 'deleteContentBackward') { if (!SLASH.query) closeSlash(); else { SLASH.query = SLASH.query.slice(0, -1); drawSlash(); } return; }
    closeSlash(); return;
  }
  if (e.inputType === 'insertText' && e.data === '/') openSlash();
}
function onBodyKey(e) {
  if (!SLASH) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); SLASH.active = (SLASH.active + 1) % SLASH.items.length; drawSlash(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); SLASH.active = (SLASH.active - 1 + SLASH.items.length) % SLASH.items.length; drawSlash(); }
  else if (e.key === 'Enter') { e.preventDefault(); chooseSlash(SLASH.active); }
  else if (e.key === 'Escape') { e.preventDefault(); closeSlash(); }
}

function showState(html, isErr) {
  app.innerHTML = `<div class="state${isErr ? ' err' : ''}">${html}</div>`;
}

function askToken() {
  showState(`Sign in to read your notes.<br><br>
    <button id="signin">Paste a GitHub token</button>`, false);
  document.getElementById('signin').onclick = () => {
    const t = prompt('GitHub personal access token (Contents: read):');
    if (t) { setToken(t.trim()); TOKEN = t.trim(); route(); }
  };
}

// ── FAB ───────────────────────────────────────────────────────────────────────
function clearFabs() {
  document.querySelectorAll('.fab, .fab-cancel').forEach((el) => el.remove());
}

function setFab(mode) {
  clearFabs();
  if (mode === 'edit') {
    const btn = document.createElement('button');
    btn.className = 'fab'; btn.textContent = '✎ Edit';
    btn.onclick = enableEdit;
    document.body.appendChild(btn);
  } else if (mode === 'save') {
    const cancel = document.createElement('button');
    cancel.className = 'fab-cancel'; cancel.textContent = '✕ Cancel';
    cancel.onclick = cancelEdit;
    const save = document.createElement('button');
    save.className = 'fab'; save.textContent = '✓ Save';
    save.onclick = saveNote;
    document.body.appendChild(cancel);
    document.body.appendChild(save);
  }
}

// ── Edit mode ─────────────────────────────────────────────────────────────────
function enableEdit() {
  const titleEl = document.querySelector('.note .title');
  const bodyEl = document.querySelector('.note .body');
  const propsEl = document.querySelector('.note .props');
  if (!titleEl || !bodyEl) return;
  titleEl.contentEditable = 'true';
  bodyEl.contentEditable = 'true';
  if (propsEl) propsEl.innerHTML = propsEdit(NOTE);
  document.body.classList.add('editing');
  // Put cursor at end of title
  titleEl.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  setFab('save');
}

function cancelEdit() {
  if (!NOTE) return;
  closeSlash();
  const titleEl = document.querySelector('.note .title');
  const bodyEl = document.querySelector('.note .body');
  const propsEl = document.querySelector('.note .props');
  if (!titleEl || !bodyEl) return;
  titleEl.contentEditable = 'false';
  bodyEl.contentEditable = 'false';
  titleEl.textContent = NOTE.title;
  bodyEl.innerHTML = marked.parse(NOTE.body || '');
  if (propsEl) propsEl.innerHTML = propsView(NOTE);
  document.body.classList.remove('editing');
  setFab('edit');
}

async function saveNote() {
  if (!NOTE || !CFG) return;
  closeSlash();
  const titleEl = document.querySelector('.note .title');
  const bodyEl = document.querySelector('.note .body');
  const propsEl = document.querySelector('.note .props');
  const saveBtn = document.querySelector('.fab');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const newTitle = (titleEl?.textContent || '').trim() || NOTE.title;
  const newBody = td.turndown(bodyEl?.innerHTML || '');
  const dateEl = propsEl?.querySelector('.prop-date');
  const tagsEl = propsEl?.querySelector('.prop-tags');
  const newDate = dateEl ? (dateEl.value ? dateEl.value + 'T00:00:00.000Z' : '') : NOTE.date;
  const newTags = tagsEl ? tagsEl.value.split(',').map((s) => s.trim()).filter(Boolean) : NOTE.tags;
  const raw = patchFm(NOTE.fmRaw, { titleKey: NOTE.titleKey, title: newTitle, dateKey: NOTE.dateKey, date: newDate, tags: newTags }) + newBody + '\n';

  try {
    const result = await ghPut(
      `/repos/${CFG.repo}/contents/${NOTE.path}`,
      TOKEN,
      { message: `edit: ${newTitle}`, content: encodeB64(raw), sha: NOTE.sha, branch: CFG.branch }
    );
    // Update in-memory state to the committed version
    NOTE.sha = result.content.sha;
    NOTE.title = newTitle;
    NOTE.body = newBody;
    NOTE.date = newDate;
    NOTE.tags = newTags;
    // keep the in-memory graph fresh: cached note + link index (title may have changed)
    const cached = NOTES.find((x) => x.name === NOTE.name);
    if (cached) { cached.title = newTitle; cached.body = newBody; cached.date = newDate; cached.tags = newTags; cached.sha = NOTE.sha; }
    LINK_INDEX[NOTE.name.toLowerCase()] = NOTE.name;
    if (newTitle) LINK_INDEX[newTitle.toLowerCase()] = NOTE.name;
    titleEl.contentEditable = 'false';
    bodyEl.contentEditable = 'false';
    if (propsEl) propsEl.innerHTML = propsView(NOTE);
    document.body.classList.remove('editing');
    setFab('edit');
  } catch (e) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Save'; }
    if (e.code === 401) { askToken(); return; }
    const msg = e.code === 403
      ? 'Save failed (403) — your token needs Contents: write access.'
      : 'Save failed: ' + e.message;
    alert(msg);
  }
}

// Build a list-route hash for a given tag/folder filter combo (either may be null).
function hashFor(tag, folder) {
  const p = new URLSearchParams();
  if (tag) p.set('tag', tag);
  if (folder) p.set('folder', folder);
  const s = p.toString();
  return s ? `#/?${s}` : '#/';
}

// ── Views ─────────────────────────────────────────────────────────────────────
async function renderList(activeTag, activeFolder) {
  showState('Loading notes…');
  clearFabs();
  NOTE = null;
  await loadAllNotes();

  if (!NOTES.length) {
    showState('No notes yet. Create one in the CMS, then come back.', false);
    return;
  }
  const pills = [];
  if (activeTag) pills.push(`<a class="active-filter" href="${hashFor(null, activeFolder)}">🏷 ${esc(activeTag)} <span class="x">✕</span></a>`);
  if (activeFolder) pills.push(`<a class="active-filter" href="${hashFor(activeTag, null)}">📁 ${esc(folderLabel(activeFolder))} <span class="x">✕</span></a>`);
  app.innerHTML = `<section class="list">
    <div class="list-head">
      <h2>Notes</h2>
      <div class="list-actions">
        <button class="navbtn" id="newNote">+ New</button>
        <button class="navbtn" id="dailyNote">📅 Today</button>
      </div>
    </div>
    <input class="search" type="search" placeholder="Search notes…" aria-label="Search notes" autocomplete="off">
    <div class="filter-row">${pills.join('')}</div>
    <div class="cards"></div>
  </section>`;
  app.querySelector('#newNote').onclick = newNote;
  app.querySelector('#dailyNote').onclick = openDaily;

  const cardsEl = app.querySelector('.cards');
  const searchEl = app.querySelector('.search');
  const draw = (q) => {
    const query = (q || '').trim().toLowerCase();
    let pool = NOTES.filter((n) =>
      (!activeTag || (n.tags || []).includes(activeTag)) &&
      (!activeFolder || n.folder === activeFolder));
    const hits = !query ? pool : pool.filter((n) =>
      (n.title || '').toLowerCase().includes(query) ||
      (n.tags || []).join(' ').toLowerCase().includes(query) ||
      (n.body || '').toLowerCase().includes(query));
    cardsEl.innerHTML = hits.length
      ? hits.map((n) => `
        <a class="card" href="#/note/${encodeURIComponent(n.name)}">
          <div class="t">${esc(n.title) || n.name}</div>
          <div class="m">
            <span class="path-badge" data-folder="${esc(n.folder)}" title="${esc(n.path)}">${esc(folderLabel(n.folder))}</span>
            ${[fmtDate(n.date)].filter(Boolean).join('  —  ')}
          </div>
          ${(n.tags || []).length ? `<div class="tags">${(n.tags || []).map((t) => `<span class="tag-chip" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}</div>` : ''}
        </a>`).join('')
      : `<div class="state">No notes match “${esc(query)}”${activeTag ? ` in #${esc(activeTag)}` : ''}${activeFolder ? ` (${esc(folderLabel(activeFolder))})` : ''}.</div>`;
  };
  draw('');
  searchEl.addEventListener('input', () => draw(searchEl.value));
  cardsEl.addEventListener('click', (e) => {
    const tagChip = e.target.closest('.tag-chip');
    const folderChip = e.target.closest('.path-badge');
    if (tagChip) {
      e.preventDefault(); e.stopPropagation();
      const t = tagChip.dataset.tag;
      location.hash = hashFor(activeTag === t ? null : t, activeFolder);
    } else if (folderChip) {
      e.preventDefault(); e.stopPropagation();
      const f = folderChip.dataset.folder;
      location.hash = hashFor(activeTag, activeFolder === f ? null : f);
    }
  });
}

async function renderNote(name) {
  showState('Loading…');
  clearFabs();
  document.body.classList.remove('editing');
  await ensureNotes(); // cache + link index, so [[links]] resolve, backlinks compute, and we know which folder this note lives in
  const cached = NOTES.find((x) => x.name === name);
  if (!cached) { showState('Note not found.', true); return; }
  const data = await gh(`/repos/${CFG.repo}/contents/${cached.path}?ref=${CFG.branch}`, TOKEN);
  const n = parseNote(decodeB64(data.content));

  NOTE = { name, path: cached.path, folder: cached.folder, sha: data.sha, fmRaw: n.fmRaw, titleKey: n.titleKey, dateKey: n.dateKey, title: n.title, date: n.date, tags: n.tags, body: n.body };

  const backlinks = NOTES.filter((o) => o.name !== name && wikiTargets(o.body).some((t) => resolveLink(t) === name));
  const backlinksHtml = backlinks.length ? `
    <section class="backlinks">
      <h3>Linked from</h3>
      ${backlinks.map((o) => `<a class="backlink" href="#/note/${encodeURIComponent(o.name)}">${esc(o.title) || o.name}</a>`).join('')}
    </section>` : '';

  app.innerHTML = `<article class="note">
    <a class="path-badge" href="${hashFor(null, cached.folder)}" title="${esc(cached.path)}">${esc(folderLabel(cached.folder))}</a>
    <h1 class="title">${esc(n.title) || name}</h1>
    <div class="props">${propsView(NOTE)}</div>
    <div class="body">${marked.parse(n.body || '')}</div>
    ${backlinksHtml}
  </article>`;

  const bodyEl = document.querySelector('.note .body');
  bodyEl.addEventListener('input', onBodyInput);   // slash menu (only fires when editable)
  bodyEl.addEventListener('keydown', onBodyKey);

  document.querySelector('.back').setAttribute('href', '#/');
  setFab('edit');
  if (PENDING_EDIT) { PENDING_EDIT = false; enableEdit(); }
}

// ── Router ────────────────────────────────────────────────────────────────────
async function route() {
  if (!CFG) {
    try { CFG = await loadConfig(); } catch (e) { showState('Could not read config.yml.', true); return; }
  }
  if (!CFG.repo || CFG.repo.includes('OWNER') || CFG.repo.includes('NOTES_REPO')) {
    showState('This notebook isn’t wired up yet — <code>repo</code> in admin/config.yml is still a placeholder.', true);
    return;
  }
  TOKEN = getToken();
  if (!TOKEN) { askToken(); return; }

  const hash = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = hash.split('?');
  try {
    if (path.startsWith('note/')) await renderNote(decodeURIComponent(path.slice(5)));
    else { const p = new URLSearchParams(qs); await renderList(p.get('tag'), p.get('folder')); }
  } catch (e) {
    if (e.code === 401) { askToken(); return; }
    if (e.code === 404) { showState('Notes not found. Check the repo/branch in config, and that your token can read it.', true); return; }
    showState('Error: ' + esc(e.message), true);
  }
}

addEventListener('hashchange', route);
route();
