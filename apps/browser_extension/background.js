const RULESET_ID = 'focuskit-blocklist';
const ALARM_NAME = 'focus-session';
const STORAGE_KEYS = {
  blocklist: 'blocklist',
  focusEnabled: 'focusEnabled',
  sessionMinutes: 'sessionMinutes',
  // Pomodoro settings/state
  focusMinutes: 'focusMinutes',
  breakMinutes: 'breakMinutes',
  longBreakMinutes: 'longBreakMinutes',
  sessionsBeforeLong: 'sessionsBeforeLong',
  autoStartNext: 'autoStartNext',
  currentMode: 'currentMode', // 'idle' | 'focus' | 'break'
  sessionEndTs: 'sessionEndTs', // ms epoch
  sessionStartTs: 'sessionStartTs', // ms epoch
  sessionCount: 'sessionCount', // completed focus sessions in current cycle
  stats: 'stats' // { 'YYYY-MM-DD': { sessions: number, focusSeconds: number, tasksDone: number } }
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function normalizeDomain(input) {
  try {
    if (!input) return null;
    let value = String(input).trim().toLowerCase();
    value = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
    value = value.split('/')[0].split('?')[0];
    if (!value) return null;
    return value;
  } catch (_) {
    return null;
  }
}

async function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

async function setStorage(obj) {
  return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
}

async function updateTodayStats(delta) {
  const data = await getStorage([STORAGE_KEYS.stats]);
  const stats = data[STORAGE_KEYS.stats] || {};
  const key = todayKey();
  const day = stats[key] || { sessions: 0, focusSeconds: 0, tasksDone: 0 };
  stats[key] = {
    sessions: Math.max(0, (day.sessions || 0) + (delta.sessions || 0)),
    focusSeconds: Math.max(0, (day.focusSeconds || 0) + (delta.focusSeconds || 0)),
    tasksDone: Math.max(0, (day.tasksDone || 0) + (delta.tasksDone || 0))
  };
  await setStorage({ [STORAGE_KEYS.stats]: stats });
}

async function getBlocklist() {
  const data = await getStorage([STORAGE_KEYS.blocklist]);
  const list = Array.isArray(data[STORAGE_KEYS.blocklist]) ? data[STORAGE_KEYS.blocklist] : [];
  return list.map(normalizeDomain).filter(Boolean);
}

async function isFocusEnabled() {
  const data = await getStorage([STORAGE_KEYS.focusEnabled]);
  return Boolean(data[STORAGE_KEYS.focusEnabled]);
}

async function setFocusEnabled(enabled) {
  await setStorage({ [STORAGE_KEYS.focusEnabled]: Boolean(enabled) });
}

function buildRulesFromBlocklist(blocklist) {
  let nextId = 1;
  const rules = [];
  for (const domain of blocklist) {
    rules.push({
      id: nextId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ['main_frame', 'sub_frame']
      }
    });
  }
  return rules;
}

async function clearDynamicRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = existing.map((r) => r.id);
  if (ids.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids, addRules: [] });
  }
}

async function applyRules(rules) {
  await clearDynamicRules();
  if (rules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [], addRules: rules });
  }
}

async function updateFocusRules() {
  const enabled = await isFocusEnabled();
  if (!enabled) {
    await clearDynamicRules();
    return;
  }
  const blocklist = await getBlocklist();
  const rules = buildRulesFromBlocklist(blocklist);
  await applyRules(rules);
}

async function startFocusSession(minutes) {
  const durationMinutes = Number(minutes) > 0 ? Number(minutes) : 25;
  const endTs = Date.now() + durationMinutes * 60 * 1000;
  await setStorage({ [STORAGE_KEYS.sessionMinutes]: durationMinutes });
  await setFocusEnabled(true);
  await setStorage({ [STORAGE_KEYS.currentMode]: 'focus', [STORAGE_KEYS.sessionEndTs]: endTs, [STORAGE_KEYS.sessionStartTs]: Date.now() });
  await updateFocusRules();
  await chrome.alarms.create(ALARM_NAME, { when: endTs });
}

async function stopFocusSession() {
  await chrome.alarms.clear(ALARM_NAME);
  await setFocusEnabled(false);
  await setStorage({ [STORAGE_KEYS.currentMode]: 'idle', [STORAGE_KEYS.sessionEndTs]: null, [STORAGE_KEYS.sessionStartTs]: null });
  await updateFocusRules();
}

// Pomodoro helpers
function pickBreakTip() {
  const tips = [
    'Stand and stretch for 2 minutes',
    'Take a short walk',
    'Drink water',
    'Rest your eyes and look far away',
    'Breathe: 4-4-4-4 box breathing'
  ];
  return tips[Math.floor(Math.random() * tips.length)];
}

async function ensurePomodoroDefaults() {
  const data = await getStorage([
    STORAGE_KEYS.focusMinutes,
    STORAGE_KEYS.breakMinutes,
    STORAGE_KEYS.longBreakMinutes,
    STORAGE_KEYS.sessionsBeforeLong,
    STORAGE_KEYS.autoStartNext,
    STORAGE_KEYS.currentMode,
    STORAGE_KEYS.sessionCount,
    STORAGE_KEYS.stats
  ]);
  const defaults = {};
  if (!data[STORAGE_KEYS.focusMinutes]) defaults[STORAGE_KEYS.focusMinutes] = 25;
  if (!data[STORAGE_KEYS.breakMinutes]) defaults[STORAGE_KEYS.breakMinutes] = 5;
  if (!data[STORAGE_KEYS.longBreakMinutes]) defaults[STORAGE_KEYS.longBreakMinutes] = 15;
  if (!data[STORAGE_KEYS.sessionsBeforeLong]) defaults[STORAGE_KEYS.sessionsBeforeLong] = 4;
  if (typeof data[STORAGE_KEYS.autoStartNext] === 'undefined') defaults[STORAGE_KEYS.autoStartNext] = true;
  if (!data[STORAGE_KEYS.currentMode]) defaults[STORAGE_KEYS.currentMode] = 'idle';
  if (typeof data[STORAGE_KEYS.sessionCount] === 'undefined') defaults[STORAGE_KEYS.sessionCount] = 0;
  if (!data[STORAGE_KEYS.stats]) defaults[STORAGE_KEYS.stats] = {};
  if (Object.keys(defaults).length > 0) await setStorage(defaults);
}

async function startPomodoroCycle(settings) {
  await ensurePomodoroDefaults();
  const toSet = {};
  if (settings && settings.focusMinutes) toSet[STORAGE_KEYS.focusMinutes] = Number(settings.focusMinutes);
  if (settings && settings.breakMinutes) toSet[STORAGE_KEYS.breakMinutes] = Number(settings.breakMinutes);
  if (settings && settings.longBreakMinutes) toSet[STORAGE_KEYS.longBreakMinutes] = Number(settings.longBreakMinutes);
  if (settings && settings.sessionsBeforeLong) toSet[STORAGE_KEYS.sessionsBeforeLong] = Number(settings.sessionsBeforeLong);
  if (typeof settings?.autoStartNext === 'boolean') toSet[STORAGE_KEYS.autoStartNext] = settings.autoStartNext;
  if (Object.keys(toSet).length > 0) await setStorage(toSet);
  const data = await getStorage([
    STORAGE_KEYS.focusMinutes
  ]);
  await startMode('focus', Number(data[STORAGE_KEYS.focusMinutes]) || 25);
}

async function stopPomodoroCycle() {
  await chrome.alarms.clear(ALARM_NAME);
  await setStorage({ [STORAGE_KEYS.currentMode]: 'idle', [STORAGE_KEYS.sessionEndTs]: null, [STORAGE_KEYS.sessionStartTs]: null, [STORAGE_KEYS.sessionCount]: 0 });
  await setFocusEnabled(false);
  await updateFocusRules();
}

async function startMode(mode, minutes) {
  const duration = Number(minutes) > 0 ? Number(minutes) : 25;
  const endTs = Date.now() + duration * 60 * 1000;
  await setStorage({ [STORAGE_KEYS.currentMode]: mode, [STORAGE_KEYS.sessionEndTs]: endTs, [STORAGE_KEYS.sessionStartTs]: mode === 'focus' ? Date.now() : null });
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when: endTs });
  if (mode === 'focus') {
    await setFocusEnabled(true);
  } else {
    await setFocusEnabled(false);
  }
  await updateFocusRules();
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await getStorage(Object.values(STORAGE_KEYS));
  if (typeof data[STORAGE_KEYS.focusEnabled] === 'undefined') {
    await setFocusEnabled(false);
  }
  if (!Array.isArray(data[STORAGE_KEYS.blocklist])) {
    await setStorage({ [STORAGE_KEYS.blocklist]: ['youtube.com', 'twitter.com', 'reddit.com'] });
  }
  if (typeof data[STORAGE_KEYS.sessionMinutes] === 'undefined') {
    await setStorage({ [STORAGE_KEYS.sessionMinutes]: 25 });
  }
  await ensurePomodoroDefaults();
  await updateFocusRules();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  if (changes[STORAGE_KEYS.blocklist] || changes[STORAGE_KEYS.focusEnabled]) {
    await updateFocusRules();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const data = await getStorage([
    STORAGE_KEYS.currentMode,
    STORAGE_KEYS.focusMinutes,
    STORAGE_KEYS.breakMinutes,
    STORAGE_KEYS.longBreakMinutes,
    STORAGE_KEYS.sessionsBeforeLong,
    STORAGE_KEYS.sessionCount,
    STORAGE_KEYS.autoStartNext,
    STORAGE_KEYS.sessionStartTs,
    STORAGE_KEYS.sessionEndTs
  ]);
  const mode = data[STORAGE_KEYS.currentMode] || 'idle';
  const autoNext = Boolean(data[STORAGE_KEYS.autoStartNext]);
  if (mode === 'focus') {
    // Record stats for completed focus
    const startTs = Number(data[STORAGE_KEYS.sessionStartTs] || 0);
    const endTs = Number(data[STORAGE_KEYS.sessionEndTs] || Date.now());
    const deltaSeconds = startTs && endTs ? Math.max(0, Math.floor((endTs - startTs) / 1000)) : Math.floor((Number(data[STORAGE_KEYS.focusMinutes] || 25)) * 60);
    await updateTodayStats({ sessions: 1, focusSeconds: deltaSeconds });

    const newCount = Number(data[STORAGE_KEYS.sessionCount] || 0) + 1;
    await setStorage({ [STORAGE_KEYS.sessionCount]: newCount, [STORAGE_KEYS.sessionStartTs]: null });
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Focus complete',
        message: `Great work. ${pickBreakTip()}`
      });
    } catch (_) {}
    const useLong = newCount % Number(data[STORAGE_KEYS.sessionsBeforeLong] || 4) === 0;
    const mins = useLong ? Number(data[STORAGE_KEYS.longBreakMinutes] || 15) : Number(data[STORAGE_KEYS.breakMinutes] || 5);
    if (autoNext) {
      await startMode('break', mins);
    } else {
      await setStorage({ [STORAGE_KEYS.currentMode]: 'break', [STORAGE_KEYS.sessionEndTs]: null });
      await setFocusEnabled(false);
      await updateFocusRules();
    }
  } else if (mode === 'break') {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Break over',
        message: 'Ready for the next deep work block?'
      });
    } catch (_) {}
    if (autoNext) {
      await startMode('focus', Number(data[STORAGE_KEYS.focusMinutes] || 25));
    } else {
      await setStorage({ [STORAGE_KEYS.currentMode]: 'idle', [STORAGE_KEYS.sessionEndTs]: null });
      await setFocusEnabled(false);
      await updateFocusRules();
    }
  }
});

chrome.commands?.onCommand?.addListener(async (command) => {
  const data = await getStorage([
    STORAGE_KEYS.focusMinutes,
    STORAGE_KEYS.currentMode,
    STORAGE_KEYS.focusEnabled
  ]);
  if (command === 'start_focus') {
    await startFocusSession(Number(data[STORAGE_KEYS.focusMinutes] || 25));
  } else if (command === 'stop_focus') {
    await stopFocusSession();
  } else if (command === 'toggle_focus') {
    const enabled = Boolean(data[STORAGE_KEYS.focusEnabled]);
    if (enabled && (data[STORAGE_KEYS.currentMode] === 'focus')) {
      await stopFocusSession();
    } else {
      await startFocusSession(Number(data[STORAGE_KEYS.focusMinutes] || 25));
    }
  } else if (command === 'start_pomodoro') {
    await startPomodoroCycle({});
  } else if (command === 'stop_pomodoro') {
    await stopPomodoroCycle();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message && message.type === 'getStatus') {
      const data = await getStorage([
        STORAGE_KEYS.focusEnabled,
        STORAGE_KEYS.sessionMinutes,
        STORAGE_KEYS.currentMode,
        STORAGE_KEYS.sessionEndTs,
        STORAGE_KEYS.focusMinutes,
        STORAGE_KEYS.breakMinutes,
        STORAGE_KEYS.longBreakMinutes,
        STORAGE_KEYS.sessionsBeforeLong,
        STORAGE_KEYS.autoStartNext,
        STORAGE_KEYS.stats
      ]);
      sendResponse({
        focusEnabled: Boolean(data[STORAGE_KEYS.focusEnabled]),
        sessionMinutes: data[STORAGE_KEYS.sessionMinutes] || 25,
        currentMode: data[STORAGE_KEYS.currentMode] || 'idle',
        sessionEndTs: data[STORAGE_KEYS.sessionEndTs] || null,
        settings: {
          focusMinutes: data[STORAGE_KEYS.focusMinutes] || 25,
          breakMinutes: data[STORAGE_KEYS.breakMinutes] || 5,
          longBreakMinutes: data[STORAGE_KEYS.longBreakMinutes] || 15,
          sessionsBeforeLong: data[STORAGE_KEYS.sessionsBeforeLong] || 4,
          autoStartNext: Boolean(data[STORAGE_KEYS.autoStartNext])
        },
        stats: data[STORAGE_KEYS.stats] || {}
      });
      return;
    }
    if (message && message.type === 'startFocus') {
      await startFocusSession(message.minutes);
      sendResponse({ ok: true });
      return;
    }
    if (message && message.type === 'stopFocus') {
      await stopFocusSession();
      sendResponse({ ok: true });
      return;
    }
    if (message && message.type === 'startPomodoro') {
      await startPomodoroCycle(message.settings || {});
      sendResponse({ ok: true });
      return;
    }
    if (message && message.type === 'stopPomodoro') {
      await stopPomodoroCycle();
      sendResponse({ ok: true });
      return;
    }
    if (message && message.type === 'stats:addTasksDone') {
      // Adjust tasks done counter for today by +delta
      const delta = Number(message.delta || 0);
      if (delta !== 0) await updateTodayStats({ tasksDone: delta });
      sendResponse({ ok: true });
      return;
    }
    if (message && message.type === 'stats:addPauseReason') {
      const reason = String(message.reason || 'other').toLowerCase();
      const data = await getStorage([STORAGE_KEYS.stats]);
      const stats = data[STORAGE_KEYS.stats] || {};
      const key = todayKey();
      const day = stats[key] || { sessions: 0, focusSeconds: 0, tasksDone: 0 };
      day.pauses = day.pauses || {};
      day.pauses[reason] = (day.pauses[reason] || 0) + 1;
      stats[key] = day;
      await setStorage({ [STORAGE_KEYS.stats]: stats });
      sendResponse({ ok: true });
      return;
    }
  })();
  return true; // keep message channel open for async
});