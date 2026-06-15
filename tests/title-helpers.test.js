'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { friendlyDomain, cleanTitle, stripTitleNoise, smartTitle, timeAgo } =
  require('../extension/lib/attribution.js');

test('friendlyDomain maps known hosts and strips www', () => {
  assert.equal(friendlyDomain('www.github.com'), 'GitHub');
  assert.equal(friendlyDomain('github.com'), 'GitHub');
  assert.equal(friendlyDomain('news.ycombinator.com'), 'Hacker News');
});

test('friendlyDomain handles substack + github.io patterns', () => {
  assert.equal(friendlyDomain('platformer.substack.com'), "Platformer's Substack");
  assert.equal(friendlyDomain('someone.github.io'), 'Someone (GitHub Pages)');
});

test('cleanTitle strips a trailing site-name suffix', () => {
  assert.equal(cleanTitle('The Great Article — GitHub', 'github.com'), 'The Great Article');
  // leaves the title alone when the suffix is not the site name
  assert.equal(cleanTitle('Part 1 — Part 2', 'example.com'), 'Part 1 — Part 2');
});

test('stripTitleNoise removes notification counts and emails', () => {
  assert.equal(stripTitleNoise('(3) New messages'), 'New messages');
  assert.equal(stripTitleNoise('Inbox (16,359)'), 'Inbox');
  assert.equal(stripTitleNoise('Mailbox - jane.doe@example.com'), 'Mailbox');
  assert.equal(stripTitleNoise('alerts@bank.com'), '');
});

test('smartTitle derives a readable title for known URL shapes', () => {
  assert.equal(smartTitle('https://x.com/jack/status/123', 'https://x.com/jack/status/123'), 'Post by @jack');
  assert.equal(smartTitle('github.com', 'https://github.com/momentmaker/ypuf'), 'momentmaker/ypuf');
});

test('timeAgo buckets relative time', () => {
  const now = Date.now();
  assert.equal(timeAgo(now), 'just now');
  assert.equal(timeAgo(now - 5 * 60000), '5 min ago');
  assert.equal(timeAgo(now - 3 * 86400000), '3 days ago');
});
