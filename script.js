'use strict';

// DEFAULT CUES: change these to customize what loads after a page refresh.
// Times are seconds since Start (e.g. 6:30 = 390 seconds).
const defaults = [
  {seconds:10,text:'IE Crash Course'},
  {seconds:130,text:'Invocation'},
  {seconds:220,text:'Sukha Kriya'},
  {seconds:700,text:'AUM Chanting'},
  {seconds:1000,text:'Agna focused Fluttering Breaths'},
  {seconds:1360,text:'Bandhas'},
  {seconds:1480,text:'Agna Focused Breath Watching'},
  {seconds:2220,text:'Invocation'}
];

// Timer state; nothing is stored between page refreshes.
let cues = defaults.map((cue, i) => ({ ...cue, id: i + 1, played: false }));
let nextId = cues.length + 1;
let elapsed = 0;
let startedAt = 0;
let intervalId = null;
let paused = false;
let wakeLock = null;

const $ = id => document.getElementById(id);
const format = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// Parse a timestamp entered as MM:SS.
function parseTime(value) {
  const match = /^(\d+):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// The final cue determines the sequence length.
function duration() { return Math.max(1, ...cues.map(cue => cue.seconds)); }
function isRunning() { return intervalId !== null; }
function setStatus(message) { $('status').textContent = message; }

// Sort by cue time, then ID to keep equal-time cues in a stable order.
function sortedCues() {
  return [...cues].sort((a, b) => a.seconds - b.seconds || a.id - b.id);
}

// Build editable cue rows using DOM elements (not HTML string injection).
function renderCues() {
  const root = $('cues');
  root.replaceChildren();
  const ordered = sortedCues();

  for (let index = 0; index < ordered.length; index++) {
    const cue = ordered[index];
    // The next cue determines the duration of the current event.
    const nextSeconds = index < ordered.length - 1
      ? ordered[index + 1].seconds
      : null;
    const row = document.createElement('div');
    row.className = 'cue' + (cue.played ? ' played' : '');

    // Absolute cue timestamp, measured from Start.
    const time = document.createElement('input');
    time.value = format(cue.seconds);
    time.setAttribute('aria-label', 'Cue time MM:SS');
    time.disabled = isRunning() || paused;
    time.addEventListener('change', () => {
      const seconds = parseTime(time.value);
      if (seconds === null) {
        alert('Use MM:SS, for example 06:30');
        time.value = format(cue.seconds);
        return;
      }
      cue.seconds = seconds;
      // Changing an absolute time changes the displayed neighboring durations.
      update();
      renderCues();
    });

    // Duration of the CURRENT event until the NEXT cue.
    const length = document.createElement('input');

    length.value = nextSeconds !== null
      ? format(nextSeconds - cue.seconds)
      : '';

    length.placeholder = '—';
    length.setAttribute('aria-label', 'Duration until next cue MM:SS');
    length.title = 'Time until the next cue';

    // The final cue has no following event.
    length.disabled = isRunning() || paused || nextSeconds === null;

    length.addEventListener('change', () => {
      const seconds = parseTime(length.value);

      if (seconds === null) {
        alert('Use MM:SS, for example 02:00');
        length.value = nextSeconds !== null
          ? format(nextSeconds - cue.seconds)
          : '';
        return;
      }

      // Change the duration of THIS event.
      // Shift the NEXT cue and every subsequent cue.
      // All later event durations remain unchanged.
      const newNextTime = cue.seconds + seconds;
      const shift = newNextTime - nextSeconds;

      for (let later = index + 1; later < ordered.length; later++) {
        ordered[later].seconds += shift;
      }

      update();
      renderCues();
    });



    const message = document.createElement('input');
    message.value = cue.text;
    message.placeholder = 'Spoken message';
    message.setAttribute('aria-label', 'Spoken message');
    message.disabled = isRunning() || paused;
    message.addEventListener('input', () => { cue.text = message.value; });

    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = 'Delete cue';
    remove.setAttribute('aria-label', 'Delete cue');
    remove.disabled = isRunning() || paused;
    remove.addEventListener('click', () => {
      cues = cues.filter(item => item.id !== cue.id);
      update();
      renderCues();
    });

    row.append(time, length, message, remove);
    root.append(row);
  }
  $('add').disabled = isRunning() || paused;
}

// Refresh the visible clock, progress bar, and next-cue label.
function update() {
  const total = duration();
  $('clock').textContent = format(Math.min(elapsed, total));
  $('total').textContent = 'of ' + format(total);
  $('fill').style.width = (100 * Math.min(elapsed / total, 1)) + '%';
  const upcoming = cues.filter(cue => !cue.played && cue.seconds > elapsed).sort((a, b) => a.seconds - b.seconds)[0];
  $('next').textContent = upcoming ? 'Next cue: ' + format(upcoming.seconds) : (elapsed >= total ? 'Finished' : 'No upcoming cues');
  $('start').textContent = isRunning() ? 'Pause' : paused ? 'Resume' : 'Start';
}

// Speak a cue using the voice available on the current phone/browser.
function speak(message) {
  if (!message.trim()) return;
  if (!('speechSynthesis' in window)) {
    setStatus('Speech synthesis is not supported in this browser.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  utterance.pitch = 1;
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.toLowerCase().startsWith('en') && /natural|premium|enhanced/i.test(v.name))
    || voices.find(v => v.lang.toLowerCase().startsWith('en'));
  if (preferred) utterance.voice = preferred;
  speechSynthesis.speak(utterance);
}

// OPTIONAL FUTURE MP3 SUPPORT — intentionally disabled.
// Add a field such as `mp3: 'sounds/my-cue.mp3'` to a cue above.
// Then replace `speak(cue.text)` in tick() with:
// if (cue.mp3) {
//   const audio = new Audio(cue.mp3);
//   audio.play().catch(console.warn);
// } else {
//   speak(cue.text);
// }
// Put the MP3 files in a `sounds/` folder in your GitHub Pages repository.

// Ask the browser to keep the screen awake while the timer runs.
// iOS/browser support varies; this is not a guarantee.
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (error) {
    console.info('Wake lock unavailable:', error.message);
  }
}
async function releaseWakeLock() {
  try { if (wakeLock) await wakeLock.release(); } catch (_) {}
  wakeLock = null;
}

// Use performance.now() instead of counting intervals, preventing clock drift.
// A browser can still suspend speech or script execution while backgrounded.
function tick() {
  if (!isRunning()) return;
  elapsed = Math.max(elapsed, (performance.now() - startedAt) / 1000);
  for (const cue of sortedCues()) {
    if (!cue.played && elapsed >= cue.seconds) {
      cue.played = true; // Never trigger the same cue twice.
      speak(cue.text);
    }
  }
  if (elapsed >= duration()) { finish(); return; }
  update();
}

function finish() {
  clearInterval(intervalId);
  intervalId = null;
  elapsed = duration();
  paused = false;
  releaseWakeLock();
  setStatus('Sequence complete.');
  update();
  renderCues();
}

// Start, Pause, or Resume from the same button.
function start() {
  if (isRunning()) {
    tick();
    if (!isRunning()) return;
    clearInterval(intervalId);
    intervalId = null;
    paused = true;
    releaseWakeLock();
    setStatus('Paused.');
    update();
    renderCues();
    return;
  }
  if (!cues.length) { setStatus('Add at least one cue first.'); return; }
  if (!('speechSynthesis' in window)) { setStatus('This browser does not support spoken cues.'); return; }
  if (!paused) { elapsed = 0; cues.forEach(cue => { cue.played = false; }); }

  // The Start tap provides a user gesture for browser voice initialization.
  speechSynthesis.getVoices();
  startedAt = performance.now() - elapsed * 1000;
  intervalId = setInterval(tick, 100);
  paused = false;
  requestWakeLock();
  setStatus('Running. Keep this page visible.');
  update();
  renderCues();
}

function reset() {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
  paused = false;
  elapsed = 0;
  cues.forEach(cue => { cue.played = false; });
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  releaseWakeLock();
  setStatus('Ready.');
  update();
  renderCues();
}

// Attach controls once the deferred script runs after HTML parsing.
$('start').addEventListener('click', start);
$('reset').addEventListener('click', reset);
$('add').addEventListener('click', () => {
  cues.push({ id: nextId++, seconds: duration() + 60, text: 'New cue', played: false });
  update();
  renderCues();
});

// Re-request wake lock and update elapsed time after returning to the tab.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning()) {
    requestWakeLock();
    tick();
  }
});

setStatus('Ready.');
update();
renderCues();
