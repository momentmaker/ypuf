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

  // Until U7 fills the list, show the invitational empty state.
  if (recent && empty && recent.children.length === 0) {
    empty.hidden = false;
  }

  // Surface the current recall binding (U7 fleshes this out).
  const hint = document.getElementById('hotkey-hint');
  if (hint && chrome.commands?.getAll) {
    chrome.commands.getAll((cmds) => {
      const recall = cmds.find((c) => c.name === 'recall');
      hint.textContent = recall?.shortcut ? `Recall: ${recall.shortcut}` : 'Recall: unset';
    });
  }
})();
