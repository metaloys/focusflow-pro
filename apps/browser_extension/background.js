const RULESET_ID = 'focuskit-blocklist';
const ALARM_NAME = 'focus-session';
const STORAGE_KEYS = {
  blocklist: 'blocklist',
  focusEnabled: 'focusEnabled',
  sessionMinutes: 'sessionMinutes'
};

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
  // Build a compact set of block rules. Each rule needs a unique id.
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
  await setStorage({ [STORAGE_KEYS.sessionMinutes]: durationMinutes });
  await setFocusEnabled(true);
  await updateFocusRules();
  const when = Date.now() + durationMinutes * 60 * 1000;
  await chrome.alarms.create(ALARM_NAME, { when });
}

async function stopFocusSession() {
  await chrome.alarms.clear(ALARM_NAME);
  await setFocusEnabled(false);
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
  await setFocusEnabled(false);
  await updateFocusRules();
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Focus session complete',
      message: 'Nice work—time for a break!'
    });
  } catch (_) {
    // Notifications may be unavailable on some browsers
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message && message.type === 'getStatus') {
      const enabled = await isFocusEnabled();
      const data = await getStorage([STORAGE_KEYS.sessionMinutes]);
      sendResponse({ focusEnabled: enabled, sessionMinutes: data[STORAGE_KEYS.sessionMinutes] || 25 });
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
  })();
  return true; // keep message channel open for async
});