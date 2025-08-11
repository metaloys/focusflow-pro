const minutesEl = document.getElementById('minutes');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const statusEl = document.getElementById('status');

function setStatus(text) {
  statusEl.textContent = text;
}

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function refreshStatus() {
  const res = await sendMessage({ type: 'getStatus' });
  if (!res) return;
  minutesEl.value = res.sessionMinutes || 25;
  setStatus(res.focusEnabled ? 'Focus mode: ON' : 'Focus mode: OFF');
}

startBtn.addEventListener('click', async () => {
  const minutes = Number(minutesEl.value) || 25;
  await sendMessage({ type: 'startFocus', minutes });
  await refreshStatus();
});

stopBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'stopFocus' });
  await refreshStatus();
});

refreshStatus();