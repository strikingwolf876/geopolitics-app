import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wikiTargets, mdLinkTargets, fmFieldBlock, curatedWikiTargets,
  buildLinkIndex, resolveAgainst, outboundOf, backlinksOf,
} from './linkgraph.js';

test('wikiTargets extracts [[slug]] and [[slug|label]] targets', () => {
  assert.deepEqual(wikiTargets('see [[foo]] and [[bar|Bar Label]]'), ['foo', 'bar']);
  assert.deepEqual(wikiTargets('no links here'), []);
});

test('mdLinkTargets extracts relative .md link basenames', () => {
  const body = [
    'See [imperial overstretch](../doctrines/imperial-overstretch.md) and',
    '[wolfowitz](wolfowitz-doctrine.md#section), plus [site](https://example.com)',
    'and a [mailto](mailto:a@b.com) and a dir link [ledger](../ledger/).',
  ].join('\n');
  assert.deepEqual(mdLinkTargets(body), ['imperial-overstretch', 'wolfowitz-doctrine']);
});

test('mdLinkTargets excludes external URLs and directory-only links', () => {
  const body = '[ext](https://x.com/a.md) [dir](../ledger/) [anchor](#top) [plain](note.md)';
  assert.deepEqual(mdLinkTargets(body), ['note']);
});

test('fmFieldBlock captures inline and block YAML forms, stopping at the next key', () => {
  const fm = [
    'type: transcript',
    'used_by: [[the-last-spy-2025-transcript]]',
    'companion:',
    '  - "[[wolfowitz-doctrine]]"',
    '  - "[[imperial-overstretch]]"',
    'status: draft',
  ].join('\n');
  assert.match(fmFieldBlock(fm, 'used_by'), /\[\[the-last-spy-2025-transcript\]\]/);
  assert.doesNotMatch(fmFieldBlock(fm, 'used_by'), /companion/);
  const companionBlock = fmFieldBlock(fm, 'companion');
  assert.match(companionBlock, /wolfowitz-doctrine/);
  assert.match(companionBlock, /imperial-overstretch/);
  assert.doesNotMatch(companionBlock, /status/);
});

test('curatedWikiTargets merges related/used_by/companion/resource fields', () => {
  const fm = [
    'type: case',
    'related: [[mearsheimer-lobby-vs-trump-iran-deal-2026-06]], [[wolfowitz-doctrine]]',
    'resource: [[some-source]]',
  ].join('\n');
  assert.deepEqual(
    curatedWikiTargets(fm).sort(),
    ['mearsheimer-lobby-vs-trump-iran-deal-2026-06', 'some-source', 'wolfowitz-doctrine'].sort(),
  );
});

test('buildLinkIndex resolves by filename slug and by title, case-insensitively', () => {
  const notes = [{ name: 'wolfowitz-doctrine', title: 'Wolfowitz Doctrine' }];
  const index = buildLinkIndex(notes);
  assert.equal(resolveAgainst(index, 'wolfowitz-doctrine'), 'wolfowitz-doctrine');
  assert.equal(resolveAgainst(index, 'Wolfowitz Doctrine'), 'wolfowitz-doctrine');
  assert.equal(resolveAgainst(index, 'WOLFOWITZ-DOCTRINE'), 'wolfowitz-doctrine');
  assert.equal(resolveAgainst(index, 'no-such-note'), null);
});

test('outboundOf merges curated frontmatter links and body .md links, deduped and self-excluded', () => {
  const notes = [
    { name: 'imperial-overstretch', title: 'Imperial Overstretch' },
    { name: 'wolfowitz-doctrine', title: 'Wolfowitz Doctrine' },
    { name: 'mearsheimer-lobby-vs-trump-iran-deal-2026-06', title: 'Mearsheimer vs Trump' },
  ];
  const index = buildLinkIndex(notes);
  const note = {
    name: 'mearsheimer-lobby-vs-trump-iran-deal-2026-06',
    fmRaw: 'type: case\nrelated: [[wolfowitz-doctrine]]\n',
    body: 'links [imperial overstretch](../doctrines/imperial-overstretch.md) and again '
      + '[wolfowitz](../doctrines/wolfowitz-doctrine.md) and [self](mearsheimer-lobby-vs-trump-iran-deal-2026-06.md)',
  };
  assert.deepEqual(
    outboundOf(note, index).sort(),
    ['imperial-overstretch', 'wolfowitz-doctrine'].sort(),
  );
});

test('backlinksOf finds notes linking in via a relative .md link', () => {
  const notes = [
    { name: 'imperial-overstretch', title: 'Imperial Overstretch', fmRaw: 'type: doctrine\n', body: 'no outgoing links' },
    {
      name: 'mearsheimer-lobby-vs-trump-iran-deal-2026-06',
      title: 'Mearsheimer vs Trump',
      fmRaw: 'type: case\n',
      body: '[imperial overstretch](../doctrines/imperial-overstretch.md) and [wolfowitz](../doctrines/wolfowitz-doctrine.md)',
    },
    { name: 'wolfowitz-doctrine', title: 'Wolfowitz Doctrine', fmRaw: 'type: doctrine\n', body: '' },
  ];
  const index = buildLinkIndex(notes);
  assert.deepEqual(backlinksOf(notes, index, 'imperial-overstretch'), ['mearsheimer-lobby-vs-trump-iran-deal-2026-06']);
});

test('backlinksOf finds notes linking in via a curated frontmatter [[slug]]', () => {
  const notes = [
    { name: 'the-last-spy-2025-transcript', title: 'The Last Spy', fmRaw: 'used_by: [[wolfowitz-doctrine]]\ncompanion: [[imperial-overstretch]]\n', body: '' },
    { name: 'wolfowitz-doctrine', title: 'Wolfowitz Doctrine', fmRaw: 'type: doctrine\n', body: '' },
    { name: 'imperial-overstretch', title: 'Imperial Overstretch', fmRaw: 'type: doctrine\n', body: '' },
  ];
  const index = buildLinkIndex(notes);
  assert.deepEqual(backlinksOf(notes, index, 'wolfowitz-doctrine'), ['the-last-spy-2025-transcript']);
  assert.deepEqual(backlinksOf(notes, index, 'imperial-overstretch'), ['the-last-spy-2025-transcript']);
});

test('backlinksOf dedupes a note that links in via both a body link and a frontmatter [[slug]]', () => {
  const notes = [
    {
      name: 'a',
      fmRaw: 'related: [[b]]\n',
      body: 'also see [b](b.md)',
    },
    { name: 'b', fmRaw: '', body: '' },
  ];
  const index = buildLinkIndex(notes);
  assert.deepEqual(backlinksOf(notes, index, 'b'), ['a']);
});

test('full scenario: imperial-overstretch backlinks include the mearsheimer case via body link, '
  + 'and the-last-spy transcript surfaces via frontmatter used_by/companion', () => {
  const notes = [
    { name: 'imperial-overstretch', title: 'Imperial Overstretch', fmRaw: 'type: doctrine\n', body: '' },
    { name: 'wolfowitz-doctrine', title: 'Wolfowitz Doctrine', fmRaw: 'type: doctrine\n', body: '' },
    {
      name: 'mearsheimer-lobby-vs-trump-iran-deal-2026-06',
      title: 'Mearsheimer vs Trump',
      fmRaw: 'type: case\n',
      body: 'See [imperial overstretch](../doctrines/imperial-overstretch.md) and [wolfowitz doctrine](../doctrines/wolfowitz-doctrine.md).',
    },
    {
      name: 'the-last-spy-2025-transcript',
      title: 'The Last Spy',
      fmRaw: 'type: transcript\nused_by: [[wolfowitz-doctrine]]\ncompanion: [[imperial-overstretch]]\n',
      body: 'a transcript with no outgoing markdown links',
    },
  ];
  const index = buildLinkIndex(notes);
  assert.deepEqual(
    backlinksOf(notes, index, 'imperial-overstretch').sort(),
    ['mearsheimer-lobby-vs-trump-iran-deal-2026-06', 'the-last-spy-2025-transcript'].sort(),
  );
  assert.deepEqual(
    outboundOf(notes.find((n) => n.name === 'the-last-spy-2025-transcript'), index).sort(),
    ['imperial-overstretch', 'wolfowitz-doctrine'].sort(),
  );
});
