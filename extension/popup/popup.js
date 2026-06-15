/*
 * ypuf — popup shell (U1).
 *
 * The shelf list (U7), the let-go button wiring (U5), and the privacy
 * controls / what's-indexed view (U8) attach to these elements as they land.
 * U1 keeps it inert but loadable so the extension opens with no console errors.
 */
'use strict';

(function () {
  const recent = document.getElementById('recent');
  const empty = document.getElementById('empty');

  // Let-go trigger (U5): the SW owns the capture; the popup just asks.
  const letgo = document.getElementById('letgo');
  if (letgo) {
    letgo.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'let-go' });
      window.close();
    });
  }

  // Shelf list (U7): the SW owns the store; the popup renders what it returns.
  // Every page-derived string goes through textContent — never innerHTML.
  const T = (window.ypuf && window.ypuf.titles) || {};

  function render(items) {
    recent.textContent = '';
    if (!items || !items.length) { empty.hidden = false; return; }
    empty.hidden = true;
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'recent-item' + (it.contentLess ? ' content-less' : '');
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = (T.cleanTitle ? T.cleanTitle(it.title || it.url || '', it.host || '') : it.title) || it.url || '(untitled)';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const host = T.friendlyDomain ? T.friendlyDomain(it.host || '') : (it.host || '');
      const ago = T.timeAgo ? T.timeAgo(it.timestamp) : '';
      meta.textContent = [host, ago].filter(Boolean).join('  ·  ');
      li.append(title, meta);
      li.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'recall-open', recordId: it.id });
        window.close();
      });
      recent.appendChild(li);
    }
  }

  chrome.runtime.sendMessage({ type: 'list-recent' }, (resp) => {
    if (chrome.runtime.lastError) return;
    render(resp && resp.items);
  });

  // Surface the current recall binding (U7 fleshes this out).
  const hint = document.getElementById('hotkey-hint');
  if (hint && chrome.commands?.getAll) {
    chrome.commands.getAll((cmds) => {
      const recall = cmds.find((c) => c.name === 'recall');
      hint.textContent = recall?.shortcut ? `Recall: ${recall.shortcut}` : 'Recall: unset';
    });
  }
})();
