/*
 * ypuf — RSS 2.0 / Atom parser (slice 5 / U5, R13).
 *
 * Every field is extracted as text and decoded to a literal string — a <title>
 * carrying markup (CDATA `<img onerror=…>` or escaped `&lt;script&gt;`) comes out
 * as inert literal text, never as DOM. The sandbox renders these via textContent,
 * so the markup can never execute (R13). The parser never produces or re-serialises
 * HTML.
 *
 * No DOMParser (so it is node-testable in this no-build repo) — a small, careful
 * extractor for the few fields a calm headline panel needs. Built test-first
 * (tests/rss.test.js).
 */
(function (root) {
  'use strict';

  function safeCp(n) { try { return String.fromCodePoint(n); } catch { return ''; } }

  function decodeEntities(s) {
    return String(s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCp(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
      .replace(/&amp;/g, '&'); // last, so "&amp;lt;" decodes to "&lt;", not "<"
  }

  // Inner content of an element → a plain text string. CDATA yields its literal
  // contents; otherwise stray tags are dropped and entities decoded. Always a
  // string, so it is inert when rendered via textContent.
  function textOf(inner) {
    if (inner == null) return '';
    let s = String(inner).trim();
    const cdata = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdata) return cdata[1].trim();
    s = s.replace(/<[^>]*>/g, '');
    return decodeEntities(s).trim();
  }

  const firstTag = (block, tag) => {
    const m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(block);
    return m ? m[1] : null;
  };

  function blocks(xml, tag) {
    const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml))) out.push(m[1]);
    return out;
  }

  function atomLink(entry) {
    const m = /<link\b[^>]*\brel\s*=\s*"alternate"[^>]*\bhref\s*=\s*"([^"]*)"/i.exec(entry)
      || /<link\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*\brel\s*=\s*"alternate"/i.exec(entry)
      || /<link\b[^>]*\bhref\s*=\s*"([^"]*)"/i.exec(entry);
    return m ? decodeEntities(m[1]) : '';
  }

  function parseRss(xml, max, source) {
    return blocks(xml, 'item').slice(0, max).map((it) => ({
      title: textOf(firstTag(it, 'title')) || '(untitled)',
      link: textOf(firstTag(it, 'link')),
      source,
      time: textOf(firstTag(it, 'pubDate')) || textOf(firstTag(it, 'dc:date')),
    })).filter((x) => x.link || x.title !== '(untitled)');
  }

  function parseAtom(xml, max, source) {
    return blocks(xml, 'entry').slice(0, max).map((e) => ({
      title: textOf(firstTag(e, 'title')) || '(untitled)',
      link: atomLink(e),
      source,
      time: textOf(firstTag(e, 'updated')) || textOf(firstTag(e, 'published')),
    })).filter((x) => x.link || x.title !== '(untitled)');
  }

  // parse(xml, { max }) -> [{ title, link, source, time }] (text fields). Malformed
  // or empty input returns [] — never throws (calm degrade, R11).
  function parse(xml, opts) {
    if (typeof xml !== 'string' || !xml.trim()) return [];
    const max = (opts && opts.max) || 8;
    const source = textOf(firstTag(xml, 'title')); // channel/feed title (first <title>)
    const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
    return isAtom ? parseAtom(xml, max, source) : parseRss(xml, max, source);
  }

  const api = { parse, textOf, decodeEntities };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { rss: api });
})(typeof self !== 'undefined' ? self : globalThis);
