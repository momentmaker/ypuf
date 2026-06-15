/*
 * ypuf — let-go (manual archive) pipeline (U5 / flow F1).
 *
 * Orchestration only. Every chrome.* touch (inject, close, session storage)
 * is injected via `deps`, so the gate-routing, fallback chain, in-flight
 * guard, and undo bookkeeping are unit-testable in node against the real
 * store + search + exclusion gate. background.js supplies the real deps.
 *
 *   letGo(tab, deps)  -> { kind, record? }   (the F1 flow)
 *   undo(recordId, deps)                      (reverse a let-go in the grace window)
 *
 * Capture happens ONLY here (at let-go), never continuously (R6).
 */
(function (root) {
  'use strict';

  const UNDO_MS = 6000;
  const PENDING_KEY = 'pendingUndo';

  // Build the indexed record from a successful extraction, or fall to the
  // title+URL floor when extraction yields nothing (the floor never has a hole).
  function buildRecord({ cls, tab, extracted, now, id }) {
    const content = (extracted && extracted.textContent) ? String(extracted.textContent).trim() : '';
    if (content) {
      return {
        id, url: tab.url, host: cls.host,
        title: (extracted.title || tab.title || '').trim(),
        content, excerpt: (extracted.excerpt || '').trim(),
        timestamp: now, lastAccessed: now, contentLess: false,
      };
    }
    return buildFloorRecord({ cls, tab, now, id, url: tab.url });
  }

  function buildFloorRecord({ cls, tab, now, id, url }) {
    return {
      id, url: url != null ? url : cls.url, host: cls.host,
      title: (tab.title || '').trim(),
      content: '', excerpt: '',
      timestamp: now, lastAccessed: now, contentLess: true,
    };
  }

  async function readPending(session) {
    const got = await session.get(PENDING_KEY);
    return Array.isArray(got) ? got : [];
  }

  async function pushPending(session, entry) {
    const pending = await readPending(session);
    pending.push(entry);
    await session.set(PENDING_KEY, pending);
  }

  async function removePending(session, recordId) {
    const pending = await readPending(session);
    await session.set(PENDING_KEY, pending.filter((p) => p.recordId !== recordId));
  }

  async function letGo(tab, deps) {
    const { id } = tab;
    if (deps.inFlight.has(id)) return { kind: 'skipped', reason: 'in-flight' };
    deps.inFlight.add(id);
    try {
      const cls = deps.classify(tab, deps.userBlocklist);

      if (cls.kind === 'never-index') {
        await deps.closeTab(id);
        return { kind: 'never-index' };
      }

      const now = deps.now();
      let record;
      const canExtract = cls.kind === 'extractable' && !tab.discarded && !tab.frozen;
      if (canExtract) {
        let extracted = null;
        try { extracted = await deps.inject(id); } catch { extracted = null; }
        record = buildRecord({ cls, tab, extracted, now, id: deps.makeId() });
      } else {
        // metadata-only, discarded/frozen, or restricted -> title+URL floor
        record = buildFloorRecord({ cls, tab, now, id: deps.makeId() });
      }

      await deps.store.put(record);
      deps.search.addRecord(record);
      // Record the pending-undo BEFORE closing the tab: if closeTab throws
      // (tab already gone), the archive is still reversible and not orphaned.
      await pushPending(deps.session, { recordId: record.id, title: record.title, url: record.url, expiry: now + UNDO_MS });
      await deps.closeTab(id);

      return { kind: cls.kind, record };
    } finally {
      deps.inFlight.delete(id);
    }
  }

  async function undo(recordId, deps) {
    const pending = await readPending(deps.session);
    const entry = pending.find((p) => p.recordId === recordId);
    if (!entry) return false; // nothing pending for this id — never touch the store
    await deps.store.remove(recordId);
    deps.search.removeRecord(recordId);
    await removePending(deps.session, recordId);
    if (entry.url) await deps.openTab(entry.url);
    return true;
  }

  // Drop pending-undo entries whose grace window has elapsed (called on SW wake).
  async function expirePending(session, now) {
    const pending = await readPending(session);
    const live = pending.filter((p) => p.expiry > now);
    if (live.length !== pending.length) await session.set(PENDING_KEY, live);
    return pending.length - live.length;
  }

  const api = { letGo, undo, buildRecord, buildFloorRecord, expirePending, readPending, UNDO_MS, PENDING_KEY };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { capture: api });
})(typeof self !== 'undefined' ? self : globalThis);
