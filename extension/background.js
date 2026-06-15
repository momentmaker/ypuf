/*
 * ypuf — service worker (classic worker; no `type: module`).
 *
 * Loading model: deps are pulled in via importScripts() and attach to the
 * single `self.ypuf` namespace. Listeners that must wake a terminated worker
 * are registered SYNCHRONOUSLY at top level, in the first turn of evaluation
 * (the #1 MV3 footgun is registering them inside an await/.then).
 *
 * This is the SW-as-broker (Message-passing trust): all index reads, all
 * chrome.tabs mutations, and the gate run here. Injected page scripts are
 * render/keystroke-only and never read the index or mutate tabs directly.
 */
'use strict';

importScripts(
  'vendor/minisearch.min.js',
  'lib/attribution.js',
  'lib/exclusion.js',
  'lib/store.js',
  'lib/search.js',
  'lib/capture.js',
  'lib/signal.js',
  'lib/blocklist.js',
);

const { store, search, capture, exclusion, signal, privacy } = self.ypuf;

const SNAPSHOT_KEY = 'searchSnapshot';
const BLOCKLIST_KEY = 'userBlocklist';
const inFlight = new Set();

// --- storage helpers -----------------------------------------------------

const session = {
  get: (k) => chrome.storage.session.get(k).then((o) => o[k]),
  set: (k, v) => chrome.storage.session.set({ [k]: v }),
};
const local = {
  get: (k) => chrome.storage.local.get(k).then((o) => o[k]),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

async function getUserBlocklist() {
  return (await local.get(BLOCKLIST_KEY)) || [];
}

async function persistSnapshot() {
  await local.set(SNAPSHOT_KEY, search.snapshot());
}

// Load the index snapshot; rebuild from the store on any failure; then
// reconcile against the store so an async-snapshot gap can't hide a record.
let _initPromise = null;
function initIndex() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const snap = await local.get(SNAPSHOT_KEY);
    if (!search.load(snap)) {
      search.buildFrom(await store.getAll());
    }
    const reconciled = search.reconcile(await store.getAll());
    if (reconciled) await persistSnapshot();
    await capture.expirePending(session, Date.now());
  })();
  return _initPromise;
}

// --- in-page extractor (runs in the page's isolated world) ----------------

function extractInPage() {
  try {
    // Readability/isProbablyReaderable are injected as files before this func.
    const gate = (typeof isProbablyReaderable === 'function')
      ? isProbablyReaderable(document) : true;
    const tryParse = (threshold) => {
      try { return new Readability(document.cloneNode(true), { charThreshold: threshold }).parse(); }
      catch { return null; }
    };
    let article = gate ? tryParse(500) : null;
    if (!article || !article.textContent || article.textContent.trim().length < 100) {
      article = tryParse(100);
    }
    if (article && article.textContent && article.textContent.trim()) {
      return { title: article.title, textContent: article.textContent.trim().slice(0, 200000), excerpt: (article.excerpt || '').slice(0, 400) };
    }
    const sel = document.querySelector('article, main, [role="main"], .post, .article-body, .entry-content');
    const text = sel ? (sel.innerText || '').trim() : '';
    if (text.length > 100) return { title: document.title, textContent: text.slice(0, 200000), excerpt: '' };
    return null;
  } catch {
    return null;
  }
}

async function injectExtract(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['vendor/Readability.js', 'vendor/Readability-readerable.js'],
  });
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: extractInPage });
  return res && res.result;
}

// --- deps assembly + the let-go flow -------------------------------------

async function buildDeps() {
  return {
    classify: exclusion.classify,
    userBlocklist: await getUserBlocklist(),
    inject: injectExtract,
    closeTab: (id) => chrome.tabs.remove(id),
    openTab: (url) => chrome.tabs.create({ url }),
    session,
    now: () => Date.now(),
    makeId: () => crypto.randomUUID(),
    inFlight,
    store,
    search,
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function handleLetGo() {
  await initIndex();
  const tab = await getActiveTab();
  if (!tab) return;
  const res = await capture.letGo(
    { id: tab.id, url: tab.url, title: tab.title, incognito: tab.incognito, discarded: tab.discarded, frozen: tab.frozen },
    await buildDeps(),
  );
  if (res && res.record) {
    await persistSnapshot();
    showUndoNotification(res.record);
    maybePrune();
  }
}

// Retention (R21): age + LRU + byte-budget, triggered when storage crosses
// ~75% of quota. After eviction the index is rebuilt from the (smaller) store.
const RETENTION_MAX_AGE_MS = 180 * 86400000; // 180 days
async function maybePrune() {
  try {
    if (!(await store.shouldPrune({ threshold: 0.75 }))) return;
    const { quota = 0 } = (await navigator.storage.estimate()) || {};
    const maxBytes = quota ? Math.floor(quota * 0.6) : undefined;
    const removed = await store.prune({ maxAgeMs: RETENTION_MAX_AGE_MS, maxBytes });
    if (removed) { search.buildFrom(await store.getAll()); await persistSnapshot(); }
  } catch { /* best-effort; never blocks a let-go */ }
}

function showUndoNotification(record) {
  const title = self.ypuf.titles.cleanTitle(record.title || record.url || 'page', record.host || '');
  chrome.notifications.create('ypuf-undo:' + record.id, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Let go',
    message: title || record.url || 'page',
    buttons: [{ title: 'Undo' }],
    requireInteraction: false,
    silent: true,
  }, () => void chrome.runtime.lastError);
}

async function handleUndo(recordId) {
  await initIndex();
  const pending = await capture.readPending(session);
  const entry = pending.find((p) => p.recordId === recordId);
  if (!entry || entry.expiry <= Date.now()) return; // grace window elapsed -> archive is final
  await capture.undo(recordId, await buildDeps());
  await persistSnapshot();
}

// --- passive dwell/revisit signal (U9) -----------------------------------
// Consumed by nothing in slice 1; banks data for slice 2. Gate-before-write.

const SIGNAL_KEY = 'signal';

const loadDurable = async () => (await local.get(SIGNAL_KEY)) || signal.emptyState();
const saveDurable = (durable) => local.set(SIGNAL_KEY, durable);

async function applyForeground(tab) {
  if (!tab) return;
  const durable = await loadDurable();
  const active = await session.get('signalActive');
  const next = signal.activate(
    { url: tab.url, incognito: tab.incognito }, Date.now(),
    { classify: exclusion.classify, userBlocklist: await getUserBlocklist(), active, durable },
  );
  await saveDurable(next.durable);
  await session.set('signalActive', next.active);
}

async function applyBlur() {
  const durable = await loadDurable();
  const active = await session.get('signalActive');
  const next = signal.blur(Date.now(), { active, durable });
  await saveDurable(next.durable);
  await session.set('signalActive', next.active);
}

// --- privacy controls (U8) ----------------------------------------------

const privacyDeps = (durable) => ({ store, search, signal, durable });

async function whatsIndexed() {
  const recs = await store.listRecent(Infinity);
  return { items: recs.map((r) => ({ id: r.id, title: r.title, url: r.url, host: r.host, contentLess: r.contentLess, timestamp: r.timestamp })) };
}

async function forgetPage(recordId) {
  const durable = await loadDurable();
  const bundle = await privacy.forgetPage(recordId, privacyDeps(durable));
  await saveDurable(durable);
  await persistSnapshot();
  if (bundle) {
    const pending = (await session.get('pendingForget')) || [];
    pending.push({ recordId, bundle, expiry: Date.now() + capture.UNDO_MS });
    await session.set('pendingForget', pending);
  }
  return { ok: !!bundle };
}

async function forgetPageUndo(recordId) {
  const pending = (await session.get('pendingForget')) || [];
  const entry = pending.find((p) => p.recordId === recordId);
  if (!entry || entry.expiry <= Date.now()) return { ok: false };
  const durable = await loadDurable();
  await privacy.restorePage(entry.bundle, privacyDeps(durable));
  await saveDurable(durable);
  await persistSnapshot();
  await session.set('pendingForget', pending.filter((p) => p.recordId !== recordId));
  return { ok: true };
}

async function forgetDomain(host) {
  const durable = await loadDurable();
  const n = await privacy.forgetDomain(host, privacyDeps(durable));
  await saveDurable(durable);
  await persistSnapshot();
  return { count: n };
}

async function blocklistAdd(host) {
  const list = await getUserBlocklist();
  if (!list.includes(host)) { list.push(host); await local.set(BLOCKLIST_KEY, list); }
  const durable = await loadDurable();
  const n = await privacy.retroactivePurge(host, privacyDeps(durable));
  await saveDurable(durable);
  await persistSnapshot();
  return { count: n };
}

// --- shelf (U7) ----------------------------------------------------------

async function listRecent(limit) {
  const recs = await store.listRecent(limit);
  return {
    items: recs.map((r) => ({
      id: r.id, title: r.title, url: r.url, host: r.host,
      timestamp: r.timestamp, contentLess: r.contentLess,
    })),
  };
}

// --- recall (U6 / flow F2) -----------------------------------------------

async function getRecallResults(q) {
  await initIndex();
  const total = await store.count();
  let results = [];
  if (q) {
    const hits = search.search(q).slice(0, 20);
    const recs = await Promise.all(hits.map((h) => store.get(h.id)));
    results = recs.filter(Boolean).map((r) => ({
      id: r.id, title: r.title, url: r.url, host: r.host, contentLess: r.contentLess,
    }));
  }
  return { results, total };
}

async function reopenRecord(recordId) {
  const rec = await store.get(recordId);
  if (!rec || !exclusion.isWebUrl(rec.url)) return; // reopen guard: web schemes only
  const tabs = await chrome.tabs.query({});
  const open = tabs.find((t) => t.url === rec.url);
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    if (open.windowId != null) await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: rec.url });
  }
  await store.touch(recordId);
}

async function handleRecall() {
  await initIndex();
  const tab = await getActiveTab();
  if (tab && tab.url && exclusion.isInjectable(tab.url)) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay/overlay.js'] });
      return;
    } catch { /* fall through to popup fallback */ }
  }
  try { await chrome.action.openPopup(); } catch { /* unsupported -> no-op */ }
}

// --- top-level synchronous listener registration -------------------------

chrome.runtime.onInstalled.addListener(() => { initIndex(); });
chrome.runtime.onStartup.addListener(() => { initIndex(); });

chrome.commands.onCommand.addListener((command) => {
  if (command === 'let-go') handleLetGo();
  if (command === 'recall') handleRecall();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender || sender.id !== chrome.runtime.id) return; // SW-as-broker: trust only our own contexts
  if (!msg) return;
  if (msg.type === 'let-go') { handleLetGo(); return; }
  if (msg.type === 'undo' && msg.recordId) { handleUndo(msg.recordId); return; }
  if (msg.type === 'list-recent') { listRecent(msg.limit || 15).then(sendResponse); return true; }
  if (msg.type === 'recall-search') { getRecallResults(msg.q).then(sendResponse); return true; }
  if (msg.type === 'recall-open' && msg.recordId) { reopenRecord(msg.recordId).then(() => sendResponse({ ok: true })); return true; }
  if (msg.type === 'whats-indexed') { whatsIndexed().then(sendResponse); return true; }
  if (msg.type === 'forget-page' && msg.recordId) { forgetPage(msg.recordId).then(sendResponse); return true; }
  if (msg.type === 'forget-page-undo' && msg.recordId) { forgetPageUndo(msg.recordId).then(sendResponse); return true; }
  if (msg.type === 'forget-domain' && msg.host) { forgetDomain(msg.host).then(sendResponse); return true; }
  if (msg.type === 'blocklist-add' && msg.host) { blocklistAdd(msg.host).then(sendResponse); return true; }
});

chrome.notifications.onButtonClicked.addListener((notifId, btnIndex) => {
  if (notifId.startsWith('ypuf-undo:') && btnIndex === 0) {
    handleUndo(notifId.slice('ypuf-undo:'.length));
    chrome.notifications.clear(notifId);
  }
});

// Dwell/revisit signal (U9) — listeners MUST be registered synchronously here
// so a terminated worker still wakes for them.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(applyForeground).catch(() => {});
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab && tab.active) applyForeground(tab);
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) { applyBlur(); return; }
  chrome.tabs.query({ active: true, windowId }).then(([tab]) => applyForeground(tab)).catch(() => {});
});
