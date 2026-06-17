'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rss = require('../extension/lib/rss.js');

const RSS_2 = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>News Test</title>
  <item><title>First story</title><link>https://news.test/1</link><pubDate>Mon, 15 Jun 2026 10:00:00 GMT</pubDate></item>
  <item><title><![CDATA[Second & best]]></title><link>https://news.test/2</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test</title>
  <entry><title>Atom one</title><link rel="alternate" href="https://atom.test/a"/><updated>2026-06-15T10:00:00Z</updated></entry>
  <entry><title>Atom two</title><link href="https://atom.test/b"/></entry>
</feed>`;

test('parses RSS 2.0 into text fields with channel title as source', () => {
  const items = rss.parse(RSS_2);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    title: 'First story', link: 'https://news.test/1', source: 'News Test', time: 'Mon, 15 Jun 2026 10:00:00 GMT',
  });
  assert.equal(items[1].title, 'Second & best'); // CDATA + entity-free literal
  assert.equal(items[1].link, 'https://news.test/2');
});

test('parses Atom, preferring rel="alternate" link then falling back to first href', () => {
  const items = rss.parse(ATOM);
  assert.equal(items.length, 2);
  assert.equal(items[0].link, 'https://atom.test/a');
  assert.equal(items[0].source, 'Atom Test');
  assert.equal(items[1].link, 'https://atom.test/b');
});

test('AE11: a markup-bearing title parses to inert literal text — never DOM/markup', () => {
  const cdataXss = `<rss version="2.0"><channel><title>F</title>
    <item><title><![CDATA[<img src=x onerror=alert(1)>]]></title><link>https://e.test/x</link></item></channel></rss>`;
  const escapedXss = `<rss version="2.0"><channel><title>F</title>
    <item><title>&lt;script&gt;alert(1)&lt;/script&gt;</title><link>https://e.test/y</link></item></channel></rss>`;

  assert.equal(rss.parse(cdataXss)[0].title, '<img src=x onerror=alert(1)>');   // literal string, inert via textContent
  assert.equal(rss.parse(escapedXss)[0].title, '<script>alert(1)</script>');     // decoded to literal, still inert
});

test('caps to the latest N items (default 8) so a long feed is bounded', () => {
  const items = Array.from({ length: 30 }, (_, i) =>
    `<item><title>T${i}</title><link>https://e.test/${i}</link></item>`).join('');
  const xml = `<rss version="2.0"><channel><title>Big</title>${items}</channel></rss>`;
  assert.equal(rss.parse(xml).length, 8);
  assert.equal(rss.parse(xml, { max: 3 }).length, 3);
});

test('malformed / empty / non-string input returns [] without throwing (calm degrade)', () => {
  assert.deepEqual(rss.parse('not xml at all'), []);
  assert.deepEqual(rss.parse(''), []);
  assert.deepEqual(rss.parse(null), []);
  assert.deepEqual(rss.parse('<rss><channel><title>Empty</title></channel></rss>'), []);
});

test('decodeEntities handles the nested-ampersand case correctly', () => {
  assert.equal(rss.decodeEntities('A &amp; B'), 'A & B');
  assert.equal(rss.decodeEntities('&amp;lt;'), '&lt;'); // not "<": &amp; decodes last
});
