const minutesEl = document.getElementById('minutes');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');

const pFocusEl = document.getElementById('p-focus');
const pBreakEl = document.getElementById('p-break');
const pLongEl = document.getElementById('p-long');
const pCountEl = document.getElementById('p-count');
const pAutoEl = document.getElementById('p-auto');
const pStartBtn = document.getElementById('p-start');
const pStopBtn = document.getElementById('p-stop');
const pStatusEl = document.getElementById('p-status');
const pRemainingEl = document.getElementById('p-remaining');

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function formatRemaining(ms) {
  if (!ms || ms < 0) return '--:--';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

async function refreshStatus() {
  const res = await sendMessage({ type: 'getStatus' });
  if (!res) return;
  minutesEl.value = res.sessionMinutes || 25;

  // Settings
  if (res.settings) {
    pFocusEl.value = res.settings.focusMinutes || 25;
    pBreakEl.value = res.settings.breakMinutes || 5;
    pLongEl.value = res.settings.longBreakMinutes || 15;
    pCountEl.value = res.settings.sessionsBeforeLong || 4;
    pAutoEl.checked = !!res.settings.autoStartNext;
  }

  // Mode & countdown
  const mode = res.currentMode || 'idle';
  const endTs = res.sessionEndTs || null;
  let remaining = '--:--';
  if (endTs) remaining = formatRemaining(endTs - Date.now());
  pStatusEl.textContent = `Mode: ${mode} • `;
  pRemainingEl.textContent = remaining;
}

let intervalId = null;
function ensureTicking() {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(async () => {
    const res = await sendMessage({ type: 'getStatus' });
    if (!res) return;
    const mode = res.currentMode || 'idle';
    const endTs = res.sessionEndTs || null;
    let remaining = '--:--';
    if (endTs) remaining = formatRemaining(endTs - Date.now());
    pStatusEl.textContent = `Mode: ${mode} • `;
    pRemainingEl.textContent = remaining;
  }, 1000);
}

startBtn.addEventListener('click', async () => {
  const minutes = Number(minutesEl.value) || 25;
  await sendMessage({ type: 'startFocus', minutes });
  await refreshStatus();
  ensureTicking();
});

stopBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'stopFocus' });
  await refreshStatus();
});

pStartBtn.addEventListener('click', async () => {
  const settings = {
    focusMinutes: Number(pFocusEl.value) || 25,
    breakMinutes: Number(pBreakEl.value) || 5,
    longBreakMinutes: Number(pLongEl.value) || 15,
    sessionsBeforeLong: Number(pCountEl.value) || 4,
    autoStartNext: !!pAutoEl.checked
  };
  await sendMessage({ type: 'startPomodoro', settings });
  await refreshStatus();
  ensureTicking();
});

pStopBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'stopPomodoro' });
  await refreshStatus();
});

refreshStatus();
ensureTicking();