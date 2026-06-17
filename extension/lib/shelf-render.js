/*
 * ypuf — host-rendered shelf helpers (slice 5 / U3, R13).
 *
 * The ypuf panel renders inside the PRIVILEGED board host page (extension origin,
 * full chrome.*). Recall titles/URLs are page-derived (background.js builds records
 * from document.title), so they are attacker-INFLUENCED — a page can set its title
 * to `<img onerror=…>`. An innerHTML path here would be full-extension XSS.
 *
 * So this module is split in two:
 *   - pure builders (itemRow/shelf) that put every page-derived string into a
 *     node descriptor's `text` field and nowhere else;
 *   - toDom(), which materialises a descriptor using ONLY textContent + setAttribute
 *     + addEventListener — never innerHTML.
 *
 * That split is what makes the text-only guarantee unit-testable without a DOM
 * (tests/shelf-render.test.js asserts a markup title round-trips as inert text).
 */
(function (root) {
  'use strict';

  const el = (tag, props) => Object.assign({ tag }, props);

  // opts.titles (DI): { cleanTitle, friendlyDomain, timeAgo } from lib/attribution.js.
  function titleOf(it, T) {
    if (T && T.cleanTitle) return T.cleanTitle(it.title || it.url || '', it.host || '') || it.url || '(untitled)';
    return it.title || it.url || '(untitled)';
  }
  const hostOf = (it, T) => ((T && T.friendlyDomain) ? T.friendlyDomain(it.host || '') : (it.host || ''));

  // A recall row descriptor. `action` (optional) marks the title clickable and
  // carries the click intent — a plain {action, id}, never a live handler, so the
  // descriptor stays pure and serialisable.
  function itemRow(it, tags, T, action) {
    const title = el('div', { cls: 'title' + (action ? ' clickable' : ''), text: titleOf(it, T) });
    if (action) title.click = action;
    const metaText = [hostOf(it, T)].concat(tags || []).filter(Boolean).join('  ·  ');
    const meta = el('div', { cls: 'meta', text: metaText });
    return el('li', {
      cls: 'recent-item' + (it.contentLess ? ' content-less' : ''),
      attrs: { 'data-id': it.id || '' },
      children: [title, meta],
    });
  }

  function shelf(items, T) {
    return el('ul', {
      cls: 'recent',
      children: (items || []).map((it) => itemRow(
        it,
        [T && T.timeAgo ? T.timeAgo(it.timestamp) : '', it.autoClosed ? 'let go for you' : ''],
        T,
        { action: 'open', id: it.id },
      )),
    });
  }

  // Materialise a descriptor into DOM. The only ways a string reaches the DOM are
  // textContent and setAttribute — never innerHTML. `handlers` maps a click action
  // name to fn(id). `document` is injected so this is node-testable with a stub.
  function toDom(node, document, handlers) {
    const e = document.createElement(node.tag);
    if (node.cls) e.className = node.cls;
    if (node.attrs) for (const k of Object.keys(node.attrs)) e.setAttribute(k, node.attrs[k]);
    if (typeof node.text === 'string') e.textContent = node.text;
    if (node.click && handlers && typeof handlers[node.click.action] === 'function') {
      e.addEventListener('click', () => handlers[node.click.action](node.click.id));
    }
    for (const child of (node.children || [])) e.appendChild(toDom(child, document, handlers));
    return e;
  }

  const api = { itemRow, shelf, toDom, titleOf, hostOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { shelfRender: api });
})(typeof self !== 'undefined' ? self : globalThis);
