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
  const titleOf = (it) => (T.cleanTitle ? T.cleanTitle(it.title || it.url || '', it.host || '') : it.title) || it.url || '(untitled)';

  function render(items) {
    recent.textContent = '';
    if (!items || !items.length) { empty.hidden = false; return; }
    empty.hidden = true;
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'recent-item' + (it.contentLess ? ' content-less' : '');
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = titleOf(it);
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

  // What's-indexed view + forget + block (U8).
  const shelf = document.getElementById('shelf');
  const panel = document.getElementById('indexed-panel');
  const indexedList = document.getElementById('indexed-list');
  const indexedEmpty = document.getElementById('indexed-empty');

  function showIndexed() {
    shelf.hidden = true; panel.hidden = false;
    chrome.runtime.sendMessage({ type: 'whats-indexed' }, (resp) => {
      if (!chrome.runtime.lastError) renderIndexed(resp && resp.items);
    });
  }

  function renderIndexed(items) {
    indexedList.textContent = '';
    if (!items || !items.length) { indexedEmpty.hidden = false; return; }
    indexedEmpty.hidden = true;
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'recent-item' + (it.contentLess ? ' content-less' : '');
      const title = document.createElement('div'); title.className = 'title'; title.textContent = titleOf(it);
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = it.host || '';
      const actions = document.createElement('div'); actions.className = 'actions';
      const forget = document.createElement('button'); forget.className = 'link'; forget.type = 'button'; forget.textContent = 'Forget';
      const block = document.createElement('button'); block.className = 'link'; block.type = 'button'; block.textContent = 'Block site';
      actions.append(forget, block);
      li.append(title, meta, actions);
      forget.addEventListener('click', () => doForget(it, li, actions));
      block.addEventListener('click', () => confirmBlock(it, actions));
      indexedList.appendChild(li);
    }
  }

  function doForget(it, li, actions) {
    chrome.runtime.sendMessage({ type: 'forget-page', recordId: it.id }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) return; // forget failed — don't fake success
      li.classList.add('struck');
      actions.textContent = '';
      const undo = document.createElement('button'); undo.className = 'link'; undo.type = 'button'; undo.textContent = 'Undo';
      actions.appendChild(undo);
      const timer = setTimeout(() => li.remove(), 6000);
      undo.addEventListener('click', () => {
        clearTimeout(timer);
        chrome.runtime.sendMessage({ type: 'forget-page-undo', recordId: it.id }, showIndexed);
      });
    });
  }

  function confirmBlock(it, actions) {
    actions.textContent = '';
    const q = document.createElement('span'); q.className = 'meta'; q.textContent = (it.host || 'this site') + '?';
    const keep = mkBtn('Block, keep titles', () => chrome.runtime.sendMessage({ type: 'blocklist-add', host: it.host }, showIndexed));
    const all = mkBtn('Forget all', () => chrome.runtime.sendMessage({ type: 'forget-domain', host: it.host }, showIndexed));
    const cancel = mkBtn('Cancel', showIndexed);
    actions.append(q, keep, all, cancel);
  }

  function mkBtn(label, onClick) {
    const b = document.createElement('button'); b.className = 'link'; b.type = 'button'; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  document.getElementById('open-indexed')?.addEventListener('click', showIndexed);
  document.getElementById('indexed-back')?.addEventListener('click', () => { panel.hidden = true; shelf.hidden = false; });

  // Surface the current recall binding (U7 fleshes this out).
  const hint = document.getElementById('hotkey-hint');
  if (hint && chrome.commands?.getAll) {
    chrome.commands.getAll((cmds) => {
      const recall = cmds.find((c) => c.name === 'recall');
      hint.textContent = recall?.shortcut ? `Recall: ${recall.shortcut}` : 'Recall: unset';
    });
  }
})();
