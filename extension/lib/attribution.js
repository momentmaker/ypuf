/*
 * ypuf — title & domain display helpers
 *
 * Derived from tab-out (https://github.com/zarazhang/tab-out)
 *   Copyright (c) Zara Zhang — MIT License
 * Modifications and additions:
 *   Copyright (c) momentmaker (ypuf) — MIT License
 *
 * Lifted: friendlyDomain / FRIENDLY_DOMAINS / capitalize, cleanTitle /
 * smartTitle / stripTitleNoise, timeAgo, ICONS. See NOTICE.md.
 *
 * No build step: this file is loaded via importScripts() in the service
 * worker (attaching to the `ypuf` global) and via require() in node tests.
 */
(function (root) {
  'use strict';

  const FRIENDLY_DOMAINS = {
    'github.com': 'GitHub', 'www.github.com': 'GitHub', 'gist.github.com': 'GitHub Gist',
    'youtube.com': 'YouTube', 'www.youtube.com': 'YouTube', 'music.youtube.com': 'YouTube Music',
    'x.com': 'X', 'www.x.com': 'X', 'twitter.com': 'X', 'www.twitter.com': 'X',
    'reddit.com': 'Reddit', 'www.reddit.com': 'Reddit', 'old.reddit.com': 'Reddit',
    'substack.com': 'Substack', 'www.substack.com': 'Substack',
    'medium.com': 'Medium', 'www.medium.com': 'Medium',
    'linkedin.com': 'LinkedIn', 'www.linkedin.com': 'LinkedIn',
    'stackoverflow.com': 'Stack Overflow', 'www.stackoverflow.com': 'Stack Overflow',
    'news.ycombinator.com': 'Hacker News',
    'google.com': 'Google', 'www.google.com': 'Google', 'mail.google.com': 'Gmail',
    'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive',
    'calendar.google.com': 'Google Calendar', 'meet.google.com': 'Google Meet',
    'gemini.google.com': 'Gemini', 'chatgpt.com': 'ChatGPT', 'www.chatgpt.com': 'ChatGPT',
    'chat.openai.com': 'ChatGPT', 'claude.ai': 'Claude', 'www.claude.ai': 'Claude',
    'code.claude.com': 'Claude Code', 'notion.so': 'Notion', 'www.notion.so': 'Notion',
    'figma.com': 'Figma', 'www.figma.com': 'Figma', 'slack.com': 'Slack', 'app.slack.com': 'Slack',
    'discord.com': 'Discord', 'www.discord.com': 'Discord',
    'wikipedia.org': 'Wikipedia', 'en.wikipedia.org': 'Wikipedia',
    'amazon.com': 'Amazon', 'www.amazon.com': 'Amazon', 'netflix.com': 'Netflix', 'www.netflix.com': 'Netflix',
    'spotify.com': 'Spotify', 'open.spotify.com': 'Spotify', 'vercel.com': 'Vercel', 'www.vercel.com': 'Vercel',
    'npmjs.com': 'npm', 'www.npmjs.com': 'npm', 'developer.mozilla.org': 'MDN',
    'arxiv.org': 'arXiv', 'www.arxiv.org': 'arXiv', 'huggingface.co': 'Hugging Face', 'www.huggingface.co': 'Hugging Face',
    'producthunt.com': 'Product Hunt', 'www.producthunt.com': 'Product Hunt',
  };

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function friendlyDomain(hostname) {
    if (!hostname) return '';
    if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];
    if (hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
      return capitalize(hostname.replace('.substack.com', '')) + "'s Substack";
    }
    if (hostname.endsWith('.github.io')) {
      return capitalize(hostname.replace('.github.io', '')) + ' (GitHub Pages)';
    }
    const clean = hostname
      .replace(/^www\./, '')
      .replace(/\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|us|uk|co\.uk|co\.jp)$/, '');
    return clean.split('.').map((part) => capitalize(part)).join(' ');
  }

  function stripTitleNoise(title) {
    if (!title) return '';
    title = title.replace(/^\(\d+\+?\)\s*/, '');
    title = title.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');
    // Strip email addresses (privacy minimization + cleaner display).
    title = title.replace(/\s*[\-‐-―]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
    title = title.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
    title = title.replace(/\s+on X:\s*/, ': ');
    title = title.replace(/\s*\/\s*X\s*$/, '');
    return title.trim();
  }

  function cleanTitle(title, hostname) {
    if (!title || !hostname) return title || '';
    const friendly = friendlyDomain(hostname);
    const domain = hostname.replace(/^www\./, '');
    const seps = [' - ', ' | ', ' — ', ' · ', ' – '];
    for (const sep of seps) {
      const idx = title.lastIndexOf(sep);
      if (idx === -1) continue;
      const suffix = title.slice(idx + sep.length).trim();
      const suffixLow = suffix.toLowerCase();
      if (
        suffixLow === domain.toLowerCase() ||
        suffixLow === friendly.toLowerCase() ||
        suffixLow === domain.replace(/\.\w+$/, '').toLowerCase() ||
        domain.toLowerCase().includes(suffixLow) ||
        friendly.toLowerCase().includes(suffixLow)
      ) {
        const cleaned = title.slice(0, idx).trim();
        if (cleaned.length >= 5) return cleaned;
      }
    }
    return title;
  }

  function smartTitle(title, url) {
    if (!url) return title || '';
    let pathname = '', hostname = '';
    try { const u = new URL(url); pathname = u.pathname; hostname = u.hostname; }
    catch { return title || ''; }
    const titleIsUrl = !title || title === url || title.startsWith(hostname) || title.startsWith('http');
    if ((hostname === 'x.com' || hostname === 'twitter.com' || hostname === 'www.x.com') && pathname.includes('/status/')) {
      const username = pathname.split('/')[1];
      if (username) return titleIsUrl ? `Post by @${username}` : title;
    }
    if (hostname === 'github.com' || hostname === 'www.github.com') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const [owner, repo, ...rest] = parts;
        if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
        if (rest[0] === 'pull' && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
        if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
        if (titleIsUrl) return `${owner}/${repo}`;
      }
    }
    if ((hostname === 'www.youtube.com' || hostname === 'youtube.com') && pathname === '/watch') {
      if (titleIsUrl) return 'YouTube Video';
    }
    return title || url;
  }

  function timeAgo(dateInput) {
    if (!dateInput) return '';
    const then = new Date(dateInput).getTime();
    const now = new Date().getTime();
    const diffMins = Math.floor((now - then) / 60000);
    const diffHours = Math.floor((now - then) / 3600000);
    const diffDays = Math.floor((now - then) / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return diffMins + ' min ago';
    if (diffHours < 24) return diffHours + ' hr' + (diffHours !== 1 ? 's' : '') + ' ago';
    if (diffDays === 1) return 'yesterday';
    return diffDays + ' days ago';
  }

  const ICONS = {
    archive: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m16.5 0a48.667 48.667 0 0 0-16.5 0"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>',
    forget: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>',
  };

  const api = { FRIENDLY_DOMAINS, capitalize, friendlyDomain, stripTitleNoise, cleanTitle, smartTitle, timeAgo, ICONS };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { titles: api });
})(typeof self !== 'undefined' ? self : globalThis);
