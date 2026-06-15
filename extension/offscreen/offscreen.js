/*
 * ypuf — offscreen audio host (U6 / R12).
 *
 * A service worker has no Web Audio, so the "puff" — the sound of a tab being
 * let go — plays here. A single offscreen document is reused (Chrome allows
 * only one); the SW pings it with {target:'offscreen', play:'puff'}. The puff
 * is a soft, fast-decaying filtered-noise breath, synthesized (no asset), kept
 * deliberately quiet so a calm product never startles.
 *
 * Trust boundary: only act on messages from our own extension (SW-as-broker).
 */
'use strict';

let audio;

function puff() {
  audio = audio || new AudioContext();
  const dur = 0.18;
  const frames = Math.floor(audio.sampleRate * dur);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const lp = audio.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700; // soft, breathy — no high-frequency hiss
  const gain = audio.createGain();
  gain.gain.value = 0.22;
  src.connect(lp).connect(gain).connect(audio.destination);
  src.start();
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender || sender.id !== chrome.runtime.id) return; // trust only our own contexts
  if (msg && msg.target === 'offscreen' && msg.play === 'puff') {
    try { puff(); } catch { /* audio unavailable — the close already happened */ }
  }
});
