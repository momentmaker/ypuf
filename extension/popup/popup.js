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

  // Snooze trigger + duration picker (U2): the user always picks a time; the
  // SW captures the tab and schedules the return.
  const snoozeBtn = document.getElementById('snooze-btn');
  const snoozePanel = document.getElementById('snooze-panel');
  const snoozeCustomBtn = document.getElementById('snooze-custom-btn');
  const snoozeCustomInput = document.getElementById('snooze-custom-input');

  function doSnooze(preset, custom) {
    chrome.runtime.sendMessage({ type: 'snooze', preset, custom });
    window.close();
  }
  snoozeBtn?.addEventListener('click', () => { snoozePanel.hidden = !snoozePanel.hidden; });
  for (const opt of document.querySelectorAll('.snooze-opt')) {
    opt.addEventListener('click', () => doSnooze(opt.dataset.preset));
  }
  snoozeCustomBtn?.addEventListener('click', () => { snoozeCustomInput.hidden = false; snoozeCustomInput.focus(); });
  snoozeCustomInput?.addEventListener('change', () => {
    const ts = snoozeCustomInput.value ? new Date(snoozeCustomInput.value).getTime() : NaN;
    if (!Number.isNaN(ts)) doSnooze('custom', ts);
  });

  // Opened via the snooze hotkey → reveal the picker straight away, then clear.
  chrome.storage.session.get('snoozeIntent').then((o) => {
    if (o && o.snoozeIntent) {
      if (snoozePanel) snoozePanel.hidden = false;
      chrome.storage.session.remove('snoozeIntent');
    }
  }).catch(() => {});

  // Shelf list (U7): the SW owns the store; the popup renders what it returns.
  // Every page-derived string goes through textContent — never innerHTML.
  const T = (window.ypuf && window.ypuf.titles) || {};
  const titleOf = (it) => (T.cleanTitle ? T.cleanTitle(it.title || it.url || '', it.host || '') : it.title) || it.url || '(untitled)';

  // The empty state shows only when both the let-go list and the snooze groups
  // are empty — a user with snoozed items hasn't got "nothing let go yet".
  let recentEmpty = true, snoozeEmpty = true;
  function updateEmpty() { empty.hidden = !(recentEmpty && snoozeEmpty); }

  function itemRow(it, tags) {
    const li = document.createElement('li');
    li.className = 'recent-item' + (it.contentLess ? ' content-less' : '');
    const title = document.createElement('div'); title.className = 'title'; title.textContent = titleOf(it);
    const meta = document.createElement('div'); meta.className = 'meta';
    const host = T.friendlyDomain ? T.friendlyDomain(it.host || '') : (it.host || '');
    meta.textContent = [host].concat(tags || []).filter(Boolean).join('  ·  ');
    li.append(title, meta);
    return li;
  }
  const openOnClick = (li, id) => li.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'recall-open', recordId: id });
    window.close();
  });

  function render(items) {
    recent.textContent = '';
    recentEmpty = !(items && items.length);
    updateEmpty();
    if (recentEmpty) return;
    for (const it of items) {
      const ago = T.timeAgo ? T.timeAgo(it.timestamp) : '';
      // Auto-closed items carry a quiet marker so the undo shelf doubles as a
      // discovery surface when the ambient indicator was missed (R13).
      const li = itemRow(it, [ago, it.autoClosed ? 'let go for you' : '']);
      openOnClick(li, it.id);
      recent.appendChild(li);
    }
  }

  chrome.runtime.sendMessage({ type: 'list-recent' }, (resp) => {
    if (chrome.runtime.lastError) return;
    render(resp && resp.items);
  });

  // Snooze groups (U4): "Back now" (click-to-open) and "Snoozed" (wake / later).
  const snoozeGroups = document.getElementById('snooze-groups');
  const RESNOOZE_PRESETS = [
    ['later-today', 'Later today'], ['this-evening', 'This evening'], ['tomorrow-morning', 'Tomorrow'],
    ['this-weekend', 'Weekend'], ['next-week', 'Next week'], ['when-im-back', 'When back'],
  ];

  function whenLabel(returnAt) {
    try { return new Date(returnAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); }
    catch { return ''; }
  }
  function backTag(it) {
    if (typeof it.returnAt === 'number' && it.returnAt < Date.now()) {
      const ago = T.timeAgo ? T.timeAgo(it.returnAt) : '';
      return ago ? `back · due ${ago}` : 'back now';
    }
    return 'back now';
  }
  const snoozedTag = (it) => it.untilStartup ? 'snoozed · next time you’re back'
    : (it.returnAt ? `snoozed until ${whenLabel(it.returnAt)}` : 'snoozed');

  function groupHeading(text) {
    const h = document.createElement('div'); h.className = 'group-label'; h.textContent = text; return h;
  }

  function renderSnooze(back, snoozed) {
    snoozeGroups.textContent = '';
    snoozeEmpty = !((back && back.length) || (snoozed && snoozed.length));
    updateEmpty();
    if (back && back.length) {
      snoozeGroups.appendChild(groupHeading('Back now'));
      const ul = document.createElement('ul'); ul.className = 'recent';
      for (const it of back) { const li = itemRow(it, [backTag(it)]); openOnClick(li, it.id); ul.appendChild(li); }
      snoozeGroups.appendChild(ul);
    }
    if (snoozed && snoozed.length) {
      snoozeGroups.appendChild(groupHeading('Snoozed'));
      const ul = document.createElement('ul'); ul.className = 'recent';
      for (const it of snoozed) ul.appendChild(snoozedRow(it));
      snoozeGroups.appendChild(ul);
    }
  }

  function snoozedRow(it) {
    const li = itemRow(it, [snoozedTag(it)]); // intentionally NOT click-to-open (recall via search)
    const controls = document.createElement('div'); controls.className = 'snooze-controls';
    const wake = mkBtn('Wake', () => chrome.runtime.sendMessage({ type: 'snooze-wake', recordId: it.id }, refreshSnooze));
    const later = mkBtn('Later', () => showResnooze(it.id, controls));
    controls.append(wake, later);
    li.appendChild(controls);
    return li;
  }

  function showResnooze(id, controls) {
    controls.textContent = '';
    for (const [preset, label] of RESNOOZE_PRESETS) {
      controls.appendChild(mkBtn(label, () => chrome.runtime.sendMessage({ type: 'snooze-resnooze', recordId: id, preset }, refreshSnooze)));
    }
    controls.appendChild(mkBtn('Cancel', refreshSnooze));
  }

  function refreshSnooze() {
    if (chrome.runtime.lastError) return;
    chrome.runtime.sendMessage({ type: 'snooze-list' }, (resp) => {
      if (!chrome.runtime.lastError) renderSnooze(resp && resp.back, resp && resp.snoozed);
    });
  }
  refreshSnooze();

  // --- auto-let-go: ambient status, activation, relief, badge (U8) --------
  const autoStatus = document.getElementById('auto-status');
  const autoNote = document.getElementById('auto-note');
  const relief = document.getElementById('relief');

  function setNote(text) {
    if (!autoNote) return;
    autoNote.textContent = text || '';
    autoNote.hidden = !text;
  }

  function renderAuto(s) {
    if (!autoStatus || !s) return;
    autoStatus.hidden = false;
    if (s.enabled && s.granted) {
      const week = s.week || 0;
      autoStatus.textContent = week
        ? `auto-let-go: on · ${week} let go this week`
        : 'auto-let-go: on · watching for quiet tabs';
      autoStatus.classList.remove('off');
      autoStatus.disabled = true;          // on-state is informational, not a trap
      setNote('');
    } else {
      autoStatus.textContent = 'Auto-let-go: off — turn on';
      autoStatus.classList.add('off');
      autoStatus.disabled = false;
    }
  }

  // The grant must be requested directly inside the click handler (the gesture).
  function enableAuto() {
    chrome.permissions.request({ origins: ['<all_urls>'] }, (granted) => {
      if (chrome.runtime.lastError || !granted) {
        setNote('ypuf needs access to your pages to let tabs go for you.');
        return;
      }
      chrome.runtime.sendMessage({ type: 'auto-enable' }, (resp) => {
        if (!chrome.runtime.lastError && resp) renderAuto(resp);
      });
    });
  }
  autoStatus?.addEventListener('click', () => { if (!autoStatus.disabled) enableAuto(); });

  chrome.runtime.sendMessage({ type: 'auto-summary' }, (resp) => {
    if (!chrome.runtime.lastError) renderAuto(resp);
  });

  // Relief moment (R15): once per day, only when there's something to relieve.
  chrome.runtime.sendMessage({ type: 'relief-claim' }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.show) return;
    relief.textContent = `${resp.count} let go today — all in your recall list.`;
    relief.hidden = false;
  });

  // Opening the popup is the deliberate reading surface — clear the badge.
  chrome.runtime.sendMessage({ type: 'seen-badge' }, () => void chrome.runtime.lastError);

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

  // Protected-sites view (U8/R14): what ypuf has learned to keep, correctable.
  const protectedPanel = document.getElementById('protected-panel');
  const protectedListEl = document.getElementById('protected-list');
  const protectedEmpty = document.getElementById('protected-empty');

  function showProtected() {
    shelf.hidden = true; protectedPanel.hidden = false;
    chrome.runtime.sendMessage({ type: 'protected-list' }, (resp) => {
      if (!chrome.runtime.lastError) renderProtected(resp && resp.items);
    });
  }

  function renderProtected(hosts) {
    protectedListEl.textContent = '';
    if (!hosts || !hosts.length) { protectedEmpty.hidden = false; return; }
    protectedEmpty.hidden = true;
    for (const host of hosts) {
      const li = document.createElement('li');
      li.className = 'recent-item';
      const title = document.createElement('div'); title.className = 'title';
      title.textContent = T.friendlyDomain ? T.friendlyDomain(host) : host;
      const actions = document.createElement('div'); actions.className = 'actions';
      const remove = mkBtn('Un-protect', () => {
        chrome.runtime.sendMessage({ type: 'protect-remove', host }, () => {
          if (!chrome.runtime.lastError) showProtected();
        });
      });
      actions.appendChild(remove);
      li.append(title, actions);
      protectedListEl.appendChild(li);
    }
  }

  document.getElementById('open-protected')?.addEventListener('click', showProtected);
  document.getElementById('protected-back')?.addEventListener('click', () => { protectedPanel.hidden = true; shelf.hidden = false; });

  // Surface the current recall binding (U7 fleshes this out).
  const hint = document.getElementById('hotkey-hint');
  if (hint && chrome.commands?.getAll) {
    chrome.commands.getAll((cmds) => {
      const recall = cmds.find((c) => c.name === 'recall');
      hint.textContent = recall?.shortcut ? `Recall: ${recall.shortcut}` : 'Recall: unset';
    });
  }
})();
