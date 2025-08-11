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
const pModeEl = document.getElementById('p-mode');
const pRemainingEl = document.getElementById('p-remaining');

const tasksEl = document.getElementById('tasks');
const taskInputEl = document.getElementById('task-input');
const taskPriorityEl = document.getElementById('task-priority');
const taskAddBtn = document.getElementById('task-add');

const reportsEl = document.getElementById('reports');

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

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}
function setStorage(obj) {
  return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
}

const TASKS_KEY = 'tasks';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function newTask(title, priority) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    title: title.trim(),
    priority: priority || 'normal',
    done: false,
    order: Date.now(),
    date: todayKey(),
    createdAt: Date.now()
  };
}

async function loadTasks() {
  const data = await getStorage([TASKS_KEY]);
  const all = Array.isArray(data[TASKS_KEY]) ? data[TASKS_KEY] : [];
  const today = todayKey();
  const todays = all.filter(t => t.date === today);
  todays.sort((a,b) => (a.done === b.done ? a.order - b.order : (a.done ? 1 : -1)));
  return { all, todays };
}

async function saveTasks(all) {
  await setStorage({ [TASKS_KEY]: all });
}

function prioDotClass(p) {
  return p === 'urgent' ? 'urgent' : p === 'high' ? 'high' : p === 'low' ? 'low' : 'normal';
}

async function renderTasks() {
  const { all, todays } = await loadTasks();
  tasksEl.innerHTML = '';
  todays.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.draggable = true;
    row.dataset.id = task.id;

    const drag = document.createElement('div');
    drag.className = 'drag';
    drag.textContent = '⋮⋮';

    const left = document.createElement('div');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!task.done;
    checkbox.addEventListener('change', async () => {
      const idx = all.findIndex(t => t.id === task.id);
      if (idx >= 0) {
        const wasDone = !!all[idx].done;
        const nowDone = !!checkbox.checked;
        all[idx].done = nowDone;
        await saveTasks(all);
        // Update stats if state changed
        if (nowDone && !wasDone) await sendMessage({ type: 'stats:addTasksDone', delta: 1 });
        if (!nowDone && wasDone) await sendMessage({ type: 'stats:addTasksDone', delta: -1 });
        await renderTasks();
      }
    });

    const title = document.createElement('div');
    title.className = 'task-title' + (task.done ? ' done' : '');
    title.textContent = task.title;

    left.appendChild(checkbox);
    left.appendChild(title);
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';

    const prio = document.createElement('div');
    prio.className = 'prio';
    const dot = document.createElement('span');
    dot.className = 'dot ' + prioDotClass(task.priority);
    const text = document.createElement('span');
    text.textContent = task.priority;
    prio.appendChild(dot);
    prio.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const focusBtn = document.createElement('button');
    focusBtn.textContent = 'Focus';
    focusBtn.addEventListener('click', async () => {
      const status = await sendMessage({ type: 'getStatus' });
      const mins = (status && status.settings && status.settings.focusMinutes) ? Number(status.settings.focusMinutes) : 25;
      await sendMessage({ type: 'startFocus', minutes: mins });
      window.close();
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'secondary';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const idx = all.findIndex(t => t.id === task.id);
      if (idx >= 0) {
        const wasDone = !!all[idx].done;
        all.splice(idx,1);
        await saveTasks(all);
        if (wasDone) await sendMessage({ type: 'stats:addTasksDone', delta: -1 });
        await renderTasks();
      }
    });
    actions.appendChild(focusBtn);
    actions.appendChild(delBtn);

    row.appendChild(drag);
    row.appendChild(left);
    row.appendChild(prio);
    row.appendChild(actions);

    // Drag and drop
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', task.id);
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === task.id) return;
      const today = todayKey();
      const { all: allTasks } = await loadTasks();
      const todayTasks = allTasks.filter(t => t.date === today);
      const dragged = todayTasks.find(t => t.id === draggedId);
      const target = todayTasks.find(t => t.id === task.id);
      if (!dragged || !target) return;
      const temp = dragged.order; dragged.order = target.order; target.order = temp;
      await saveTasks(allTasks);
      await renderTasks();
    });

    tasksEl.appendChild(row);
  });
}

async function refreshStatus() {
  const res = await sendMessage({ type: 'getStatus' });
  if (!res) return;
  minutesEl.value = res.sessionMinutes || 25;

  if (res.settings) {
    pFocusEl.value = res.settings.focusMinutes || 25;
    pBreakEl.value = res.settings.breakMinutes || 5;
    pLongEl.value = res.settings.longBreakMinutes || 15;
    pCountEl.value = res.settings.sessionsBeforeLong || 4;
    pAutoEl.checked = !!res.settings.autoStartNext;
  }

  const mode = res.currentMode || 'idle';
  const endTs = res.sessionEndTs || null;
  let remaining = '--:--';
  if (endTs) remaining = formatRemaining(endTs - Date.now());
  pModeEl.textContent = mode;
  pRemainingEl.textContent = remaining;

  // Reports
  renderReports(res.stats || {});
}

function formatDateLabel(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function renderReports(stats) {
  reportsEl.innerHTML = '';
  // Build a 7-day window ending today
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const day = stats[key] || { sessions: 0, focusSeconds: 0, tasksDone: 0 };
    days.push({ key, ...day });
  }
  days.forEach((day) => {
    const row = document.createElement('div');
    row.className = 'report-row';
    const d = document.createElement('div'); d.textContent = formatDateLabel(day.key);
    const focus = document.createElement('div'); focus.textContent = formatMinutes(Math.floor((day.focusSeconds||0)/60));
    const sessions = document.createElement('div'); sessions.textContent = String(day.sessions||0);
    const tasks = document.createElement('div'); tasks.textContent = String(day.tasksDone||0);
    row.appendChild(d); row.appendChild(focus); row.appendChild(sessions); row.appendChild(tasks);
    reportsEl.appendChild(row);
  });
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
    pModeEl.textContent = mode;
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

// Tasks handlers
async function addTaskFromInput() {
  const title = String(taskInputEl.value || '').trim();
  if (!title) return;
  const pr = taskPriorityEl.value || 'normal';
  const { all } = await loadTasks();
  const task = newTask(title, pr);
  all.push(task);
  await saveTasks(all);
  taskInputEl.value = '';
  await renderTasks();
}

taskAddBtn.addEventListener('click', addTaskFromInput);

taskInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTaskFromInput();
});

(async function init() {
  await refreshStatus();
  ensureTicking();
  await renderTasks();
})();