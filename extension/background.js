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
  'lib/cluster.js',
  'lib/signal.js',
  'lib/tabstate.js',
  'lib/eligibility.js',
  'lib/protection.js',
  'lib/eagerness.js',
  'lib/digest.js',
  'lib/snooze.js',
  'lib/blocklist.js',
);

const { store, search, capture, cluster, exclusion, signal, tabstate, eligibility, protection, eagerness, digest, snooze, privacy, titles } = self.ypuf;

const logErr = (e) => console.error('[ypuf]', e);

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
  const p = (async () => {
    const snap = await local.get(SNAPSHOT_KEY);
    if (!search.load(snap)) {
      search.buildFrom(await store.getAll());
    }
    const reconciled = search.reconcile(await store.getAll());
    if (reconciled) await persistSnapshot();
    await capture.expirePending(session, Date.now());
    await sweepPendingForget(Date.now());
    // The overdue sweep must not be load-bearing for the index load — degrade it,
    // don't abort initIndex (which would clear the memo and retry forever).
    try { await expireSnoozes(Date.now()); } catch (e) { logErr(e); }
  })();
  // Don't memoize a rejection — clear so the next caller retries instead of
  // permanently failing every flow for this SW lifetime.
  p.catch(() => { if (_initPromise === p) _initPromise = null; });
  _initPromise = p;
  return p;
}

// Drop forgotten-page undo bundles past their grace window so explicitly-
// forgotten page content does not linger in session storage.
async function sweepPendingForget(now) {
  const pending = (await session.get('pendingForget')) || [];
  const live = pending.filter((p) => p.expiry > now);
  if (live.length === pending.length) return;
  // Past the undo window a forget is final — only now scrub the forgotten URL(s)
  // from every other record's working set (slice 4 / R12). Deferring the scrub
  // until here keeps an in-window undo a clean reversal. Called from the
  // sibling-consuming surfaces (recall/shelf/restore) as well as initIndex, so a
  // warm-session forget is scrubbed before any reopen — not only on a cold start.
  const urls = pending.filter((p) => p.expiry <= now && p.url).map((p) => p.url);
  if (urls.length) { try { await store.scrubSiblings(urls); } catch (e) { logErr(e); } }
  await session.set('pendingForget', live);
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
    closeTab: (id) => chrome.tabs.remove(id).catch(() => {}), // tab may already be gone

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

// --- working-set clustering (slice 4 / flow F1) --------------------------
// At let-go, snapshot the tab's working set from the LIVE open tabs. The anchor
// and candidates come from the raw chrome.tabs.query result (which carries
// openerTabId/windowId natively); lastActivatedAt comes from the tabstate map.
// Best-effort: any failure yields no set and never blocks the close.

const CLUSTER_MAX = 8;
const CLUSTER_CO_WINDOW_MS = 5 * 60 * 1000;
const CLUSTER_BURST_WINDOW_MS = 90 * 1000;

function clusterSet(anchor, openTabs, tstate, blocklist) {
  try {
    return cluster.computeSet(anchor, openTabs, {
      classify: exclusion.classify, userBlocklist: blocklist, tabstate: tstate,
      maxSize: CLUSTER_MAX,
      coWindowMs: CLUSTER_CO_WINDOW_MS, burstWindowMs: CLUSTER_BURST_WINDOW_MS,
    });
  } catch (e) { logErr(e); return []; }
}

async function computeSiblings(anchor, openTabs) {
  return clusterSet(anchor, openTabs, await loadTabstate(), await getUserBlocklist());
}

async function handleLetGo() {
  await initIndex();
  const tab = await getActiveTab();
  if (!tab) return;
  const openTabs = await chrome.tabs.query({});
  const anchor = openTabs.find((t) => t.id === tab.id) || tab;
  const siblings = await computeSiblings(anchor, openTabs);
  const res = await capture.letGo(
    { id: tab.id, url: tab.url, title: tab.title, incognito: tab.incognito, discarded: tab.discarded, frozen: tab.frozen },
    await buildDeps(),
    siblings.length ? { siblings } : undefined,
  );
  if (res && res.record) {
    await persistSnapshot();
    showUndoNotification(res.record);
    maybePrune();
  }
}

// --- snooze (U2 / flow F1) ------------------------------------------------
// The voluntary twin of let-go: capture the active tab via the same pipeline,
// stamping the snooze schedule into the single pre-close store.put, then arm a
// per-item alarm for the return (clock schedules only — "when I'm back" is an
// untilStartup flag caught by the startup path).

// `tab` is the in-page snooze overlay's OWN tab (Chrome-set sender.tab — unforgeable,
// can't drift if the active tab changes while the picker is open). The popup path has
// no sender.tab, so it falls back to the tab behind the popup.
async function handleSnooze(preset, custom, tab) {
  await initIndex();
  if (!tab) tab = await getActiveTab();
  if (!tab) return;
  const schedule = snooze.resolve(preset, Date.now(), custom);
  const openTabs = await chrome.tabs.query({});
  const anchor = openTabs.find((t) => t.id === tab.id) || tab;
  const siblings = await computeSiblings(anchor, openTabs);
  const res = await capture.letGo(
    { id: tab.id, url: tab.url, title: tab.title, incognito: tab.incognito, discarded: tab.discarded, frozen: tab.frozen },
    await buildDeps(),
    Object.assign({ snoozeState: 'snoozed' }, schedule, siblings.length ? { siblings } : null),
  );
  if (res && res.record) {
    await persistSnapshot();
    if (typeof res.record.returnAt === 'number') createSnoozeAlarm(res.record.id, res.record.returnAt);
    maybePrune();
  }
}

// The snooze command opens the popup straight to the picker (the user always
// picks a time — never a silent default). The popup reads SNOOZE_INTENT_KEY.
const SNOOZE_INTENT_KEY = 'snoozeIntent';
async function openSnoozePicker() {
  const tab = await getActiveTab();
  // Prefer the in-page overlay (mirrors recall); fall back to the popup picker on
  // pages we can't inject into (chrome://, the board, the Web Store).
  if (tab && tab.url && exclusion.isInjectable(tab.url)) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay/snooze-overlay.js'] });
      return;
    } catch { /* fall through to popup fallback */ }
  }
  await session.set(SNOOZE_INTENT_KEY, true);
  // Clear the intent if the popup can't open, so it doesn't auto-show the picker
  // on a later unrelated popup open.
  try { await chrome.action.openPopup(); }
  catch { chrome.storage.session.remove(SNOOZE_INTENT_KEY).catch(() => {}); }
}

// --- snooze return lifecycle (U3 / flow F2, R9) --------------------------
// The guarantee that a snooze returns is the overdue sweep on every SW wake /
// startup; per-item alarms are best-effort timeliness only. One serialized
// chain owns the flip + badge, so a coincident alarm and sweep targeting the
// same record flip it once (idempotent — an already-back-now record is skipped).

const SNOOZE_ALARM_PREFIX = 'snooze:';
const createSnoozeAlarm = (id, when) => Promise.resolve(chrome.alarms.create(SNOOZE_ALARM_PREFIX + id, { when })).catch(logErr);
const clearSnoozeAlarm = (id) => chrome.alarms.clear(SNOOZE_ALARM_PREFIX + id).catch(() => {});

// Every write to a record's snooze state (flip, re-snooze, reopen-clear) runs
// through this one chain, so a flip can't clobber a record the user just
// reopened or re-snoozed, and a coincident alarm + sweep flip exactly once.
let _snoozeChain = Promise.resolve();
function mutateSnooze(fn) {
  _snoozeChain = _snoozeChain.then(fn).catch(logErr);
  return _snoozeChain;
}

function flipBackNow(ids) {
  return mutateSnooze(async () => {
    let flipped = 0;
    for (const id of ids) {
      const rec = await store.get(id);
      if (rec && rec.snoozeState === 'snoozed') { await store.put(snooze.mark(rec, 'back-now')); flipped += 1; }
    }
    if (flipped) { await persistSnapshot(); await bumpBadge(flipped); }
  });
}

// Overdue clock snoozes only; untilStartup records resolve only on startup.
const expireSnoozes = async (now) => flipBackNow(snooze.dueSnoozes(await store.getAll(), now).map((r) => r.id));

async function snoozeStartup() {
  try { await initIndex(); } catch (e) { logErr(e); } // re-arm + resolve must not hinge on a clean index load
  const all = await store.getAll().catch(() => []);
  for (const r of snooze.pendingClock(all)) createSnoozeAlarm(r.id, r.returnAt); // re-arm (persistAcrossSessions unreliable)
  await flipBackNow(snooze.pendingStartup(all).map((r) => r.id)); // resolve "when I'm back"
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
  const title = titles.cleanTitle(record.title || record.url || 'page', record.host || '');
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

// --- per-tab state (U1) --------------------------------------------------
// Open-tab timing/engagement, in chrome.storage.session: it survives SW
// termination but clears on browser restart — so restored tabs start with NO
// record and fail safe (never eligible until actually observed).

const TABSTATE_KEY = 'tabstate';
const STARTUP_KEY = 'startupAt';
const STARTUP_GRACE_MS = 30000;   // tabs created within 30s of startup ≈ restored
const BURST_WINDOW_MS = 1500;     // dense opener-less creations ≈ open-all-bookmarks
const BURST_MIN_CLUSTER = 5;

const loadTabstate = async () => (await session.get(TABSTATE_KEY)) || tabstate.emptyState();
const saveTabstate = (s) => session.set(TABSTATE_KEY, s);

// Serialize per-tab store mutations. Many listeners (onCreated/onActivated/
// onUpdated/onRemoved + dirty reports) read-modify-write one shared session
// object; without serialization a stale save could revert dirty:true→false or
// drop an activation, wrongly auto-closing a tab the user still cares about.
let _tabstateChain = Promise.resolve();
function mutateTabstate(mutator) {
  _tabstateChain = _tabstateChain.then(async () => {
    const s = await loadTabstate();
    await mutator(s);
    await saveTabstate(s);
  }).catch(logErr);
  return _tabstateChain;
}

async function stampCreated(tab) {
  if (!tab || tab.id == null) return;
  const startupAt = await session.get(STARTUP_KEY);
  return mutateTabstate((s) => {
    tabstate.recordCreated(s, tab.id, Date.now(), {
      openerTabId: tab.openerTabId, host: tab.url, startupAt,
      startupGraceMs: STARTUP_GRACE_MS, burstWindowMs: BURST_WINDOW_MS, burstMinCluster: BURST_MIN_CLUSTER,
    });
  });
}

const stampActivated = (tab) => (!tab || tab.id == null)
  ? Promise.resolve()
  : mutateTabstate((s) => tabstate.recordActivated(s, tab.id, Date.now(), tab.url));

const stampHost = (tabId, url) => mutateTabstate((s) => tabstate.setHost(s, tabId, url));

const writeDirty = (tabId, dirty) => mutateTabstate((s) => tabstate.setDirty(s, tabId, dirty));

async function purgeTab(tabId) {
  await mutateTabstate((s) => tabstate.deleteByTabId(s, tabId));
  await releaseClose(tabId); // a closed tab's auto-close claim is done
}

// Inject the dirty-tracker (U3) while the tab is alive so we know its unsaved-
// input state even after it's discarded. Gate-before-injection (R11): the
// content script never lands on an incognito/blocklisted/restricted page. Only
// runs when auto-let-go is enabled (host access granted).
async function maybeInjectDirty(tab) {
  if (!tab || tab.id == null || !tab.url) return;
  if (!(await isAutoEnabled())) return;
  const cls = exclusion.classify({ url: tab.url, incognito: tab.incognito }, await getUserBlocklist());
  if (cls.kind !== 'extractable') return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/dirty-tracker.js'] });
  } catch { /* host not granted / page refused — leave the tab 'unknown' (fail safe) */ }
}

// --- auto-let-go enablement (U2) -----------------------------------------
// Auto-let-go is OFF until the user grants broad host access via an in-context
// gesture (the popup calls chrome.permissions.request — see U8). The blocklist
// gate still runs in code regardless of the grant. The persisted enabled flag
// is cleared if the host permission is ever revoked, so the ambient surface
// never claims "on" while the sweep is actually dead.

const AUTO_KEY = 'autoEnabled';
const EAGERNESS_KEY = 'autoEagerness';   // 'timid' | 'balanced' | 'bold' (U3); default balanced = 3 days
const ALARM_NAME = 'auto-sweep';
const SWEEP_PERIOD_MIN = 5;
const HOST_ACCESS = { origins: ['<all_urls>'] };

const isAutoEnabled = async () => (await local.get(AUTO_KEY)) === true;
const getEagerness = async () => {
  try { const v = await local.get(EAGERNESS_KEY); return (typeof v === 'string') ? v : eagerness.DEFAULT; }
  catch { return eagerness.DEFAULT; }   // a storage read failure must not abort the sweep
};
const hasHostAccess = () => chrome.permissions.contains(HOST_ACCESS).catch(() => false);

function ensureAutoAlarm() {
  Promise.resolve(chrome.alarms.create(ALARM_NAME, { periodInMinutes: SWEEP_PERIOD_MIN })).catch(logErr);
}
const clearAutoAlarm = () => chrome.alarms.clear(ALARM_NAME).catch(() => {});

async function autoState() {
  return { enabled: await isAutoEnabled(), granted: await hasHostAccess(), eagerness: await getEagerness() };
}

// Persist the eagerness label (validated against the lib's known levels); a bolder
// or timider setting just changes the staleness window the next sweep reads.
async function setAutoEagerness(level) {
  if (!eagerness.LEVELS.some((l) => l.key === level)) return { ok: false, ...(await autoState()) };
  try { await local.set(EAGERNESS_KEY, level); }
  catch { return { ok: false, ...(await autoState()) }; }   // report the real state, not a silent snap-back
  return { ok: true, ...(await autoState()) };
}

// The popup obtained the grant in its own click handler; here we persist intent
// and arm the sweep. Refuse to enable without the grant (defensive).
async function autoEnable() {
  if (!(await hasHostAccess())) return { ok: false, ...(await autoState()) };
  await local.set(AUTO_KEY, true);
  ensureAutoAlarm();
  return { ok: true, ...(await autoState()) };
}

async function autoDisable() {
  await local.set(AUTO_KEY, false);
  await clearAutoAlarm();
  return { ok: true, ...(await autoState()) };
}

// --- auto-let-go sweep (U5) ----------------------------------------------
// Thresholds are deferred to dogfooding (CONTEXT §5a); these are conservative
// defaults. The sweep is the only place tabs auto-close, and it is gated three
// ways: the host grant, the user's enable flag, and a minimum-observation bar
// so we never calibrate against an empty signal store.

const DWELL_FLOOR_MS = 60000;           // < 60s total foreground = low investment
const ACTIVATION_FLOOR = 3;             // returned to ≥ 3 times = engaged (URL-stable)
const MIN_OBSERVED_URLS = 20;           // signal must have banked this many URLs first
const AUTOCLOSING_KEY = 'autoClosing';
const BADGE_KEY = 'autoBadge';
const PROTECTION_KEY = 'protection';
const autoInFlight = new Set();

const loadProtection = async () => (await local.get(PROTECTION_KEY)) || protection.emptyState();
const saveProtection = (s) => local.set(PROTECTION_KEY, s);

async function meetsObservationBar() {
  const durable = await loadDurable();
  return Object.keys(durable.revisits || {}).length >= MIN_OBSERVED_URLS;
}

function projectTab(t) {
  return {
    id: t.id, url: t.url, title: t.title, incognito: t.incognito,
    discarded: t.discarded, frozen: t.frozen, audible: t.audible, pinned: t.pinned,
  };
}

// `staleWindowMs` is pre-read by the sweep from the eagerness setting (U3) and
// threaded in; defaults to the eagerness DEFAULT (3 days), the single source of
// truth, so any other caller stays safe and can't drift from the lib.
function eligDeps(signalMap, blocklist, protState, staleWindowMs = eagerness.toWindowMs(eagerness.DEFAULT)) {
  return {
    tabstate,
    signal: signalMap,
    isProtected: (host) => protection.isProtected(protState, host),
    classify: exclusion.classify,
    userBlocklist: blocklist,
    now: Date.now(),
    staleWindowMs,
    dwellFloorMs: DWELL_FLOOR_MS,
    activationFloor: ACTIVATION_FLOOR,
  };
}

// Persisted close-claim: the in-memory autoInFlight Set dies with the SW, so a
// sweep interrupted mid-close could re-evaluate the same surviving tab on the
// next alarm and double-write. The session claim survives termination.
async function claimClose(id, url) {
  const m = (await session.get(AUTOCLOSING_KEY)) || {};
  if (m[id] != null) return false;
  m[id] = url; await session.set(AUTOCLOSING_KEY, m);
  return true;
}
async function releaseClose(id) {
  const m = (await session.get(AUTOCLOSING_KEY)) || {};
  if (m[id] != null) { delete m[id]; await session.set(AUTOCLOSING_KEY, m); }
}

// All badge mutations go through one chain — auto-close, snooze returns, and the
// popup-open clear are all read-modify-write on the shared BADGE_KEY.
let _badgeChain = Promise.resolve();
function bumpBadge(n) {
  _badgeChain = _badgeChain.then(async () => {
    const total = ((await session.get(BADGE_KEY)) || 0) + n;
    await session.set(BADGE_KEY, total);
    chrome.action.setBadgeBackgroundColor({ color: '#9aa0a6' }).catch(() => {});
    chrome.action.setBadgeText({ text: total ? String(total) : '' }).catch(() => {});
  }).catch(logErr);
  return _badgeChain;
}
function clearBadge() {
  _badgeChain = _badgeChain.then(async () => {
    await session.set(BADGE_KEY, 0);
    chrome.action.setBadgeText({ text: '' }).catch(() => {});
  }).catch(logErr);
  return _badgeChain;
}

// Re-check ONE candidate against LIVE state (R6) and, if still a zombie,
// capture-then-close via the reused letGo. R10: only count it closed if a
// record actually persisted.
async function autoCloseOne(id, deps, siblings, staleWindowMs) {
  if (autoInFlight.has(id)) return false;
  let live;
  try { live = await chrome.tabs.get(id); } catch { return false; } // tab already gone
  const tstate = await loadTabstate();
  let rec = tstate[id];
  // Tab-id reuse guard: if our record's host no longer matches the live tab,
  // an onRemoved+onCreated pair was missed (SW asleep) and a new tab inherited
  // the id — treat it as unobserved (drop the record) so a stale zombie verdict
  // can't carry over to a tab the user just opened.
  if (rec && rec.host && live.url && tabstate.hostOf(live.url) !== rec.host) rec = undefined;
  const signalMap = await loadDurable();
  const blocklist = await getUserBlocklist();
  const protState = await loadProtection();
  const verdict = eligibility.classify(projectTab(live), { rec, ...eligDeps(signalMap, blocklist, protState, staleWindowMs) });
  if (verdict !== 'zombie') return false;
  if (!(await claimClose(id, live.url))) return false;
  autoInFlight.add(id);
  try {
    const extra = (siblings && siblings.length) ? { autoClosed: true, siblings } : { autoClosed: true };
    const res = await capture.letGo(projectTab(live), deps, extra);
    if (!res || !res.record) { await releaseClose(id); return false; } // nothing persisted → retry later
    // letGo's closeTab swallows errors (so a capture stays reversible even if the
    // close throws). Confirm the tab is actually gone before counting it: on a
    // real chrome.tabs.remove failure the page is captured but still open, so we
    // keep the claim (no re-capture churn), skip the badge/puff, and leave it open.
    const gone = await chrome.tabs.get(id).then(() => false).catch(() => true);
    if (gone) { await releaseClose(id); return true; }
    return false;
  } catch (e) {
    await releaseClose(id);
    throw e;
  } finally {
    autoInFlight.delete(id);
  }
}

async function runAutoSweep() {
  if (!(await isAutoEnabled())) return;
  if (!(await hasHostAccess())) { await autoDisable(); return; } // grant revoked
  if (!(await meetsObservationBar())) return;
  await initIndex();

  const tabs = await chrome.tabs.query({});
  const tstate = await loadTabstate();
  const signalMap = await loadDurable();
  const blocklist = await getUserBlocklist();
  const protState = await loadProtection();
  const staleWindowMs = eagerness.toWindowMs(await getEagerness());   // U3: the user's eagerness window
  const base = eligDeps(signalMap, blocklist, protState, staleWindowMs);

  const candidates = tabs.filter((t) => t.id != null &&
    eligibility.classify(projectTab(t), { rec: tstate[t.id], ...base }) === 'zombie');
  if (!candidates.length) return;

  // Snapshot each candidate's working set from the SAME pre-loop `tabs` snapshot,
  // BEFORE the close loop mutates the tab set — so co-closing siblings still
  // appear in each other's sets regardless of close order (slice 4 / R3).
  const sibsById = new Map();
  for (const t of candidates) sibsById.set(t.id, clusterSet(t, tabs, tstate, blocklist));

  const deps = await buildDeps();
  let closed = 0;
  for (const t of candidates) {
    try {
      if (await autoCloseOne(t.id, deps, sibsById.get(t.id), staleWindowMs)) { closed += 1; puff(); } // puff per close, decoupled (U6)
    } catch (e) { logErr(e); }
  }

  if (closed) {
    await persistSnapshot();
    await reconcileIfDiverged();
    await bumpBadge(closed);
    maybePrune();
  }
}

// Auto-close churns many removes/undos mid-session; search.reconcile runs only
// on cold start, so heal divergence opportunistically after a sweep.
async function reconcileIfDiverged() {
  try {
    if (search.reconcile(await store.getAll())) await persistSnapshot();
  } catch (e) { logErr(e); }
}

// The puff (U6/R12). A service worker has no audio, so a single offscreen
// document plays the close-sound. Creation is serialized behind one promise
// (getContexts detect-before-create has a TOCTOU window under bursting closes),
// and the whole thing is catch-decoupled: an audio failure must never abort a
// sweep or block a close — the sound is cosmetic, the close is not.
let _offscreenReady = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).catch(() => []);
  if (existing && existing.length) return;
  if (!_offscreenReady) {
    _offscreenReady = chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play the brief close-sound when a tab is let go.',
    }).catch(() => {}).finally(() => { _offscreenReady = null; });
  }
  await _offscreenReady;
}

function puff() {
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ target: 'offscreen', play: 'puff' }))
    .catch(() => {});
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
  await clearSnoozeAlarm(recordId); // cancel any pending return
  await persistSnapshot();
  if (bundle) {
    const pending = (await session.get('pendingForget')) || [];
    // Carry the forgotten URL so the post-undo-window sweep can scrub it from
    // other records' working sets (slice 4 / R12 — deferred, not immediate).
    pending.push({ recordId, url: bundle.record && bundle.record.url, bundle, expiry: Date.now() + capture.UNDO_MS });
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

// Cross-store purge of the slice-2 stores (protection + per-tab state), keeping
// the "forget spans ALL stores" invariant as new stores are added (U7/S-finding).
async function purgeDomainStores(host) {
  const ps = await loadProtection();
  protection.deleteByDomain(ps, host);
  await saveProtection(ps);
  const ts = await loadTabstate();
  tabstate.deleteByDomain(ts, host);
  await saveTabstate(ts);
}

async function forgetDomain(host) {
  // Gather ids + urls BEFORE deletion — privacy.forgetDomain removes the records
  // and returns only a count. ids cancel pending snooze returns; urls scrub the
  // forgotten pages from other records' working sets (slice 4 / R12 — domain
  // forget has no undo, so scrub immediately).
  const gone = await store.getByDomain(host);
  const ids = gone.map((r) => r.id);
  const urls = gone.map((r) => r.url);
  const durable = await loadDurable();
  const n = await privacy.forgetDomain(host, privacyDeps(durable));
  await saveDurable(durable);
  await purgeDomainStores(host);
  for (const id of ids) clearSnoozeAlarm(id);
  try { await store.scrubSiblings(urls); } catch (e) { logErr(e); } // one scan for the whole domain
  await persistSnapshot();
  return { count: n };
}

async function blocklistAdd(host) {
  const list = await getUserBlocklist();
  if (!list.includes(host)) { list.push(host); await local.set(BLOCKLIST_KEY, list); }
  const durable = await loadDurable();
  const n = await privacy.retroactivePurge(host, privacyDeps(durable));
  await saveDurable(durable);
  await purgeDomainStores(host);
  await persistSnapshot();
  return { count: n };
}

// --- shelf (U7) ----------------------------------------------------------

async function listRecent(limit) {
  await sweepPendingForget(Date.now()); // keep shelf set-offers free of just-forgotten siblings
  const recs = await store.listRecent(limit);
  return {
    items: recs.filter((r) => !r.snoozeState).map((r) => ({ // snoozed/back-now live in their own groups
      id: r.id, title: r.title, url: r.url, host: r.host,
      timestamp: r.timestamp, contentLess: r.contentLess, autoClosed: !!r.autoClosed,
      siblings: Array.isArray(r.siblings) ? r.siblings : [],
    })),
  };
}

// The snooze groups (U4): every snoozed / back-now record, regardless of recency
// (a tab snoozed weeks out must still surface). Back-now newest-first; snoozed
// soonest-return first (untilStartup, which has no returnAt, sorts last).
function projectSnooze(r) {
  return {
    id: r.id, title: r.title, url: r.url, host: r.host,
    contentLess: r.contentLess, snoozeState: r.snoozeState,
    returnAt: typeof r.returnAt === 'number' ? r.returnAt : null, untilStartup: !!r.untilStartup,
  };
}
async function snoozeList() {
  const all = await store.getAll();
  const back = all.filter((r) => r.snoozeState === 'back-now')
    .sort((a, b) => (b.returnAt || 0) - (a.returnAt || 0)).map(projectSnooze);
  const snoozed = all.filter((r) => r.snoozeState === 'snoozed')
    .sort((a, b) => (a.returnAt || Infinity) - (b.returnAt || Infinity)).map(projectSnooze);
  return { back, snoozed };
}

async function snoozeWake(recordId) {
  await clearSnoozeAlarm(recordId);
  await flipBackNow([recordId]); // guarded + serialized: snoozed → back-now (no-op if already back-now)
  return { ok: true };
}

async function snoozeResnooze(recordId, preset, custom) {
  const schedule = snooze.resolve(preset, Date.now(), custom); // may throw on a bad custom — outside the chain
  await clearSnoozeAlarm(recordId);
  await mutateSnooze(async () => {
    const rec = await store.get(recordId);
    if (!rec) return;
    const updated = Object.assign(snooze.mark(rec, null), { snoozeState: 'snoozed' }, schedule);
    await store.put(updated);
    await persistSnapshot();
    if (typeof updated.returnAt === 'number') createSnoozeAlarm(recordId, updated.returnAt);
  });
  return { ok: true };
}

// --- recall (U6 / flow F2) -----------------------------------------------

async function getRecallResults(q) {
  await initIndex();
  await sweepPendingForget(Date.now()); // keep set offers free of just-forgotten siblings
  const total = await store.count();
  const durable = await loadDurable();
  const FREQUENT = 3;   // revisits that mark a load-bearing, often-returned page (§4 signal model)
  const project = (r, snippet) => ({
    id: r.id, title: r.title, url: r.url, host: r.host, contentLess: r.contentLess,
    timestamp: r.timestamp,
    frequent: ((durable.revisits && durable.revisits[r.url]) || 0) >= FREQUENT,
    siblings: Array.isArray(r.siblings) ? r.siblings : [],
    snippet: snippet || '',
  });
  let results = [];
  if (q) {
    const hits = search.search(q).slice(0, 20);
    const recs = await Promise.all(hits.map((h) => store.get(h.id)));
    results = recs.filter(Boolean).map((r) => project(r, search.excerptAround(r.content, q, 90)));
  } else {
    // Instant recent: opening the bar surfaces your latest let-go pages, ready to recall
    // (recovery faster than re-googling — F2). Snooze/back-now live in their own surfaces.
    const recs = await store.listRecent(8);
    results = recs.filter((r) => !r.snoozeState).map((r) => project(r, ''));
  }
  return { results, total };
}

// Shared reopen+dedup core (slice 4 / R8): focus an already-open tab whose URL
// matches by origin+path (stored URLs are query-stripped, so an exact compare
// would miss and spawn a duplicate), else create it. Web-scheme only. No record
// side effects — callers needing touch/snooze-clear/protect do those separately.
async function reopenUrl(url, openTabs) {
  if (!exclusion.isWebUrl(url)) return { skipped: true };
  const target = cluster.originPathKey(url);
  const open = openTabs.find((t) => t.url && cluster.originPathKey(t.url) === target);
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    if (open.windowId != null) await chrome.windows.update(open.windowId, { focused: true });
    return { focused: true };
  }
  await chrome.tabs.create({ url });
  return { created: true };
}

// Restore the working set (slice 4 / F2, R8/R10/R11). User-triggered ONLY — no
// alarm/startup path. cluster.restorePlan opens only URLs the record stored
// (intersect against siblings — a replaying popup can't open arbitrary URLs),
// web-scheme only, deduped; reopenUrl then dedups against currently-open tabs.
async function restoreSet(recordId, urls) {
  // Scrub any just-expired forgets first — the deferred scrub otherwise only runs
  // on a cold initIndex, so a warm-session forget could still be reopened here.
  await sweepPendingForget(Date.now());
  const rec = await store.get(recordId);
  if (!rec) return { ok: false };
  const plan = cluster.restorePlan(rec.siblings, urls, exclusion.isWebUrl);
  const openTabs = await chrome.tabs.query({});
  let opened = 0;
  for (const u of plan) {
    const res = await reopenUrl(u, openTabs).catch((e) => { logErr(e); return null; });
    if (res && res.created) opened += 1;
  }
  return { ok: true, opened };
}

async function reopenRecord(recordId) {
  const rec = await store.get(recordId);
  if (!rec || !exclusion.isWebUrl(rec.url)) return; // reopen guard: web schemes only
  await reopenUrl(rec.url, await chrome.tabs.query({}));
  await store.touch(recordId);
  // Reopening a snoozed/back-now record ends the snooze — it's a normal tab now.
  if (rec.snoozeState) {
    await clearSnoozeAlarm(recordId);
    await mutateSnooze(async () => {
      const fresh = await store.get(recordId);
      if (fresh) { await store.put(snooze.mark(fresh, null)); await persistSnapshot(); }
    });
  }
  // The v1 learning (R14/F2): reopening a tab ypuf auto-let-go is the strongest
  // "I wanted that" signal — protect its domain. Only auto-closed records count
  // (a manual let-go the user reopens is not a correction of ypuf).
  if (rec.autoClosed && rec.host) {
    const ps = await loadProtection();
    protection.protect(ps, rec.host);
    await saveProtection(ps);
  }
}

// --- discoverability / relief summaries (U8) -----------------------------

const RELIEF_KEY = 'reliefShownDate';

function startOfTodayMs() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

async function autoClosedRecords() {
  return (await store.getAll()).filter((r) => r.autoClosed);
}

// "Your week, unburdened" (U7/R8): a calm weekly relief tally. Lives in the SW because
// only the SW can read the record store; the board reaches it via the week-digest
// message. A store read failure degrades to an empty digest, which the board hides
// (an ambient soul line should never surface an error). Local-only.
async function weekDigest() {
  return digest.compute(await store.getAll().catch(() => []), Date.now());
}

// Ambient surface (R16): the rolling-7-day count is derived from record
// timestamps, so it's always correct after a forget/purge — no separate counter.
async function autoSummary() {
  const { enabled, granted } = await autoState();
  const weekAgo = Date.now() - 7 * 86400000;
  const week = (await autoClosedRecords()).filter((r) => (r.timestamp || 0) >= weekAgo).length;
  return { enabled, granted, week };
}

// Relief moment (R15): once per calendar day, and only when there's something
// to relieve. The claim is idempotent within a day (persisted date stamp).
async function reliefClaim() {
  const today = startOfTodayMs();
  const count = (await autoClosedRecords()).filter((r) => (r.timestamp || 0) >= today).length;
  if (count === 0) return { show: false, count: 0 };
  if ((await local.get(RELIEF_KEY)) === today) return { show: false, count };
  await local.set(RELIEF_KEY, today);
  return { show: true, count };
}

// The badge is the between-opens signal; opening the popup is the deliberate
// reading surface, so clear it on open.
async function seenBadge() {
  await clearBadge();
  return { ok: true };
}

async function protectedList() {
  return { items: protection.list(await loadProtection()).sort() };
}

async function protectRemove(host) {
  const ps = await loadProtection();
  protection.unprotect(ps, host);
  await saveProtection(ps);
  return { ok: true };
}

async function protectAdd(host) {
  const ps = await loadProtection();
  protection.protect(ps, host);
  await saveProtection(ps);
  return { ok: true };
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

// Re-arm the sweep alarm on every wake: persistAcrossSessions is unreliable, so
// re-create it whenever auto-let-go is enabled (U2/U5).
async function rearmAutoAlarm() {
  if (await isAutoEnabled()) ensureAutoAlarm();
}

chrome.runtime.onInstalled.addListener(() => { initIndex(); rearmAutoAlarm().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => {
  // Stamp startup so tabs created in the next grace window are flagged as a
  // restored-session burst (U1/R3) and excluded from auto-close.
  session.set(STARTUP_KEY, Date.now()).catch(() => {});
  initIndex();
  rearmAutoAlarm().catch(() => {});
  snoozeStartup().catch(logErr); // re-arm clock alarms + resolve "when I'm back" (U3/R9)
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'let-go') handleLetGo().catch(logErr);
  if (command === 'recall') handleRecall().catch(logErr);
  if (command === 'snooze') openSnoozePicker().catch(logErr);
});

// --- new-tab board config (slice 5 / U2) ---------------------------------
// The board host stores its panel arrangement here. The SW is the single writer:
// board pages send the FULL config on save and writes are serialized through one
// chain, so two open board tabs can't interleave or clobber each other (pattern 7).

const BOARD_CONFIG_KEY = 'boardConfig';
const DEFAULT_BOARD = { panels: [{ id: 'ypuf-1', type: 'ypuf' }], minimalMode: false };

const boardGetConfig = async () => (await local.get(BOARD_CONFIG_KEY)) || DEFAULT_BOARD;

let boardWriteChain = Promise.resolve();
function boardSaveConfig(config) {
  const write = boardWriteChain.then(() => local.set(BOARD_CONFIG_KEY, config));
  boardWriteChain = write.catch(logErr);   // the chain survives a failed write (stays serialized)
  // …but the caller learns the truth, so a failed save isn't reported as ok.
  return write.then(() => ({ ok: true }), (e) => ({ ok: false, error: String(e) }));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender || sender.id !== chrome.runtime.id) return; // SW-as-broker: trust only our own contexts
  if (!msg) return;
  if (msg.type === 'let-go') { handleLetGo().catch(logErr); return; }
  if (msg.type === 'undo' && msg.recordId) { handleUndo(msg.recordId).catch(logErr); return; }
  // Dirty-state report from the U3 content script: trust sender.tab, never a
  // body-supplied id (SW-as-broker). Boolean only — no page content crosses.
  if (msg.type === 'dirty' && sender.tab) { writeDirty(sender.tab.id, !!msg.dirty).catch(logErr); return; }
  // Async branches: always answer the caller — a rejection that never calls
  // sendResponse would hang the overlay/popup until Chrome times out the channel.
  const respond = (p) => { p.then(sendResponse).catch((e) => sendResponse({ error: String(e) })); return true; };
  if (msg.type === 'list-recent') return respond(listRecent(msg.limit || 15));
  if (msg.type === 'recall-search') return respond(getRecallResults(msg.q));
  if (msg.type === 'recall-open' && msg.recordId) return respond(reopenRecord(msg.recordId).then(() => ({ ok: true })));
  if (msg.type === 'restore-set' && msg.recordId) return respond(restoreSet(msg.recordId, msg.urls));
  if (msg.type === 'whats-indexed') return respond(whatsIndexed());
  if (msg.type === 'forget-page' && msg.recordId) return respond(forgetPage(msg.recordId));
  if (msg.type === 'forget-page-undo' && msg.recordId) return respond(forgetPageUndo(msg.recordId));
  if (msg.type === 'forget-domain' && msg.host) return respond(forgetDomain(msg.host));
  if (msg.type === 'blocklist-add' && msg.host) return respond(blocklistAdd(msg.host));
  if (msg.type === 'auto-state') return respond(autoState());
  if (msg.type === 'auto-enable') return respond(autoEnable());
  if (msg.type === 'auto-disable') return respond(autoDisable());
  if (msg.type === 'set-auto-eagerness' && msg.level) return respond(setAutoEagerness(msg.level));
  if (msg.type === 'protected-list') return respond(protectedList());
  if (msg.type === 'protect-remove' && msg.host) return respond(protectRemove(msg.host));
  if (msg.type === 'protect-add' && msg.host) return respond(protectAdd(msg.host));
  if (msg.type === 'auto-summary') return respond(autoSummary());
  if (msg.type === 'week-digest') return respond(weekDigest());
  if (msg.type === 'relief-claim') return respond(reliefClaim());
  if (msg.type === 'seen-badge') return respond(seenBadge());
  if (msg.type === 'snooze' && msg.preset) return respond(handleSnooze(msg.preset, msg.custom, sender.tab).then(() => ({ ok: true })));
  if (msg.type === 'snooze-list') return respond(snoozeList());
  if (msg.type === 'snooze-wake' && msg.recordId) return respond(snoozeWake(msg.recordId));
  if (msg.type === 'snooze-resnooze' && msg.recordId && msg.preset) return respond(snoozeResnooze(msg.recordId, msg.preset, msg.custom));
  if (msg.type === 'board-get-config') return respond(boardGetConfig());
  if (msg.type === 'board-save-config' && msg.config) return respond(boardSaveConfig(msg.config));
});

// Auto-let-go grant lifecycle. If the user revokes the broad <all_urls> host
// access from chrome://extensions, disable the sweep and clear the persisted
// "on" flag so the ambient surface tells the truth. Slice 5 adds per-origin feed
// grants whose removal must NOT disable auto-let-go — so gate on <all_urls>
// specifically, not on any origin removal.
chrome.permissions.onRemoved.addListener((perms) => {
  if (perms && perms.origins && perms.origins.includes('<all_urls>')) autoDisable().catch(logErr);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runAutoSweep().catch(logErr);
  // A snooze alarm is just a precise wake — sweep due records rather than flip by
  // id, so an alarm already enqueued before a re-snooze-to-later can't flip the
  // freshly-rescheduled record early (it's no longer due).
  else if (alarm.name.startsWith(SNOOZE_ALARM_PREFIX)) expireSnoozes(Date.now()).catch(logErr);
});

chrome.notifications.onButtonClicked.addListener((notifId, btnIndex) => {
  if (notifId.startsWith('ypuf-undo:') && btnIndex === 0) {
    handleUndo(notifId.slice('ypuf-undo:'.length)).catch(logErr);
    chrome.notifications.clear(notifId);
  }
});

// Dwell/revisit signal (U9) + per-tab state (U1) — listeners MUST be registered
// synchronously here so a terminated worker still wakes for them.
chrome.tabs.onCreated.addListener((tab) => { stampCreated(tab).catch(() => {}); });
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(async (tab) => { await applyForeground(tab); await stampActivated(tab); }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab && tab.active) applyForeground(tab);
  if (changeInfo.status === 'complete' && tab && tab.url) {
    stampHost(tabId, tab.url).catch(() => {});
    maybeInjectDirty(tab).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener((tabId) => { purgeTab(tabId).catch(() => {}); });
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) { applyBlur(); return; }
  chrome.tabs.query({ active: true, windowId }).then(([tab]) => applyForeground(tab)).catch(() => {});
});
