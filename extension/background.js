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
);

const { store, search, capture, exclusion } = self.ypuf;

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
  }
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
});

chrome.notifications.onButtonClicked.addListener((notifId, btnIndex) => {
  if (notifId.startsWith('ypuf-undo:') && btnIndex === 0) {
    handleUndo(notifId.slice('ypuf-undo:'.length));
    chrome.notifications.clear(notifId);
  }
});
