'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const sr = require('../extension/lib/shelf-render.js');

// A minimal DOM stub. textContent stores text and clears children; innerHTML is a
// trap — if toDom ever assigns it, the test reads a non-null _html and fails. This
// is how we prove the host render is text-only WITHOUT jsdom (R13, U3).
function makeEl(tag) {
  return {
    tag,
    _text: '',
    _html: null,
    className: '',
    attrs: {},
    children: [],
    listeners: {},
    set textContent(v) { this._text = String(v); this.children = []; },
    get textContent() { return this._text; },
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(n) { this.children.push(n); return n; },
    addEventListener(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); },
  };
}
const fakeDoc = () => ({ createElement: (tag) => makeEl(tag) });

const XSS = '<img src=x onerror=alert(1)>';

test('itemRow routes a markup-bearing title into the text field verbatim — never markup', () => {
  const row = sr.itemRow({ id: 'a', title: XSS, host: 'evil.test' }, [], null, { action: 'open', id: 'a' });
  const title = row.children[0];
  assert.equal(title.text, XSS);          // raw string preserved as text, not stripped/escaped
  assert.equal(title.tag, 'div');
  assert.ok(!('children' in title) || !title.children); // a text node carries no element children
});

test('toDom renders a markup title as inert textContent — innerHTML is never touched', () => {
  const row = sr.itemRow({ id: 'a', title: XSS, host: 'evil.test' }, [], null, { action: 'open', id: 'a' });
  const node = sr.toDom(row, fakeDoc(), {});
  const titleEl = node.children[0];
  assert.equal(titleEl.textContent, XSS);  // the exact bytes, rendered as text
  assert.equal(titleEl._html, null);       // innerHTML never assigned, anywhere in the tree
  assert.equal(titleEl.children.length, 0);// no parsed child elements — markup did not become DOM
});

test('toDom wires the click action to handlers.open(id) without putting it in the descriptor', () => {
  let opened = null;
  const row = sr.itemRow({ id: 'rec-7', title: 'A', host: 'e.test' }, [], null, { action: 'open', id: 'rec-7' });
  const node = sr.toDom(row, fakeDoc(), { open: (id) => { opened = id; } });
  const titleEl = node.children[0];
  assert.equal(titleEl.listeners.click.length, 1);
  titleEl.listeners.click[0]();
  assert.equal(opened, 'rec-7');
});

test('itemRow defaults the click id to the row id when the action omits one', () => {
  // Regression: the board recall panel calls itemRow with { action:'open' } and no
  // id, so clicking a row fired handlers.open(undefined) and the SW dropped it.
  let opened = null;
  const row = sr.itemRow({ id: 'rec-9', title: 'A', host: 'e.test' }, [], null, { action: 'open' });
  assert.equal(row.children[0].click.id, 'rec-9');
  const node = sr.toDom(row, fakeDoc(), { open: (id) => { opened = id; } });
  node.children[0].listeners.click[0]();
  assert.equal(opened, 'rec-9');
});

test('U4: an open-tab row wires its title to the jump action with the tabId as id (text-only)', () => {
  // Recall v2 one-box: a kind:'open' result jumps to the live tab. newtab.js passes
  // { action:'jump', id: tabId }; itemRow must carry it like any other action and the
  // title must still render text-only (open-tab titles are page-derived too).
  let jumped = null;
  const row = sr.itemRow({ id: '', title: XSS, host: 'figma.com' }, [], null, { action: 'jump', id: 42 });
  assert.equal(row.children[0].click.action, 'jump');
  assert.equal(row.children[0].click.id, 42);
  const node = sr.toDom(row, fakeDoc(), { jump: (tabId) => { jumped = tabId; } });
  const titleEl = node.children[0];
  assert.equal(titleEl.textContent, XSS);   // open-tab title rendered as inert text
  assert.equal(titleEl._html, null);
  titleEl.listeners.click[0]();
  assert.equal(jumped, 42);
});

test('shelf builds one row per item, each opening its own record id', () => {
  const ul = sr.shelf([{ id: 'a', title: 'A', host: 'h' }, { id: 'b', title: 'B', host: 'h' }], null);
  assert.equal(ul.tag, 'ul');
  assert.equal(ul.children.length, 2);
  assert.deepEqual(ul.children.map((li) => li.children[0].click.id), ['a', 'b']);
});

test('contentLess items carry the content-less class; the id rides as a data attribute', () => {
  const row = sr.itemRow({ id: 'x', title: 'Bank', host: 'bank.test', contentLess: true }, [], null, null);
  assert.match(row.cls, /content-less/);
  assert.equal(row.attrs['data-id'], 'x');
  assert.ok(!row.children[0].click); // no action → title not clickable
});

test('itemRow emits a decorative favicon img only when faviconUrl is set', () => {
  const withFav = sr.itemRow({ id: 'a', title: 'T', host: 'e.test', faviconUrl: 'chrome-extension://x/_favicon/?pageUrl=https%3A%2F%2Fe.test&size=32' }, [], null, { action: 'open' });
  const img = withFav.children[0];
  assert.equal(img.tag, 'img');
  assert.equal(img.cls, 'fav');
  assert.equal(img.attrs.alt, '');               // decorative — not announced
  assert.match(img.attrs.src, /_favicon/);
  assert.match(withFav.cls, /\bhas-fav\b/);
  assert.equal(withFav.children[1].cls.split(' ')[0], 'title'); // title follows the favicon

  const noFav = sr.itemRow({ id: 'b', title: 'T', host: 'e.test' }, [], null, { action: 'open' });
  assert.equal(noFav.children[0].cls.split(' ')[0], 'title');   // no favicon node
  assert.ok(!/has-fav/.test(noFav.cls));
});

test('itemRow carries the full title as a hover/accessible attribute (clamp stays accessible)', () => {
  const long = 'A very long page title the shelf clamps to two lines visually';
  const title = sr.itemRow({ id: 'a', title: long, host: 'e.test' }, [], null, { action: 'open' }).children[0];
  assert.equal(title.text, long);          // full accessible name (textContent unclamped)
  assert.equal(title.attrs.title, long);   // full hover tooltip
});

test('titleOf and hostOf fall back gracefully and use injected helpers when present', () => {
  assert.equal(sr.titleOf({ url: 'https://e.test/p' }, null), 'https://e.test/p');
  assert.equal(sr.titleOf({ title: '', url: '' }, null), '(untitled)');
  const T = { cleanTitle: (t) => t.toUpperCase(), friendlyDomain: () => 'Friendly' };
  assert.equal(sr.titleOf({ title: 'hi' }, T), 'HI');
  assert.equal(sr.hostOf({ host: 'x.test' }, T), 'Friendly');
});
