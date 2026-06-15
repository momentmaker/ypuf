/*
 * ypuf — service worker (classic worker; no `type: module`).
 *
 * Loading model: deps are pulled in via importScripts() and attach to the
 * single `self.ypuf` namespace. Listeners that must wake a terminated worker
 * are registered SYNCHRONOUSLY at top level, in the first turn of evaluation
 * (the #1 MV3 footgun is registering them inside an await/.then).
 *
 * U1 wires the skeleton only. Capture (U5), recall (U6), and the dwell
 * collector (U9) attach their real handlers here as they land.
 */
'use strict';

importScripts(
  'vendor/minisearch.min.js',
  'lib/attribution.js',
);

// --- top-level synchronous listener registration -------------------------

chrome.runtime.onInstalled.addListener(() => {
  // First-run hook (seed defaults, etc.) lands here as units fill in.
});

chrome.commands.onCommand.addListener((command) => {
  // Routed to capture (U5: 'let-go') and recall (U6: 'recall') as they land.
  void command;
});
