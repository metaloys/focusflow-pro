const KEY = 'blocklist';
const listEl = document.getElementById('list');
const inputEl = document.getElementById('domain');
const addBtn = document.getElementById('add');

// Supabase controls
const sbUrlEl = document.getElementById('sb-url');
const sbKeyEl = document.getElementById('sb-key');
const sbEmailEl = document.getElementById('sb-email');
const sbPasswordEl = document.getElementById('sb-password');
const sbSaveBtn = document.getElementById('sb-save');
const sbSignInBtn = document.getElementById('sb-signin');
const sbSignOutBtn = document.getElementById('sb-signout');
const sbRefreshBtn = document.getElementById('sb-refresh');
const sbStatusEl = document.getElementById('sb-status');

function setSbStatus(text) { sbStatusEl.textContent = text || ''; }

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

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}
function setStorage(obj) {
  return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
}

async function loadList() {
  const data = await getStorage([KEY]);
  const list = Array.isArray(data[KEY]) ? data[KEY] : [];
  return list;
}

function render(list) {
  listEl.innerHTML = '';
  list.forEach((domain, index) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = domain;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      const updated = [...list.slice(0, index), ...list.slice(index + 1)];
      await setStorage({ [KEY]: updated });
      render(updated);
    });
    li.appendChild(span);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

addBtn.addEventListener('click', async () => {
  const raw = inputEl.value;
  const domain = normalizeDomain(raw);
  if (!domain) return;
  const list = await loadList();
  if (list.includes(domain)) {
    inputEl.value = '';
    return;
  }
  const updated = [...list, domain];
  await setStorage({ [KEY]: updated });
  render(updated);
  inputEl.value = '';
});

(async function init() {
  const list = await loadList();
  render(list);
  await hydrateSupabaseForm();
})();

// ---------------- Supabase sync for blocklist ----------------
const SB_CFG_KEY = 'sb_config'; // { url, key, email }
let sbSession = null; // { access_token, refresh_token, user }
let sbDefaultBlocklistId = null;

async function hydrateSupabaseForm() {
  const data = await getStorage([SB_CFG_KEY]);
  const cfg = data[SB_CFG_KEY] || {};
  sbUrlEl.value = cfg.url || '';
  sbKeyEl.value = cfg.key || '';
  sbEmailEl.value = cfg.email || '';
  setSbStatus('');
}

async function saveSupabaseConfig() {
  const cfg = { url: sbUrlEl.value.trim(), key: sbKeyEl.value.trim(), email: sbEmailEl.value.trim() };
  await setStorage({ [SB_CFG_KEY]: cfg });
  setSbStatus('Saved config locally');
}

sbSaveBtn?.addEventListener('click', saveSupabaseConfig);

async function sbRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const url = sbUrlEl.value.trim();
  const key = sbKeyEl.value.trim();
  if (!url || !key) throw new Error('Supabase URL/key missing');
  const h = { 'apikey': key, 'Content-Type': 'application/json', ...headers };
  if (sbSession?.access_token) h['Authorization'] = `Bearer ${sbSession.access_token}`;
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Supabase ${method} ${path} failed: ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return text; }
}

async function sbSignIn() {
  const url = sbUrlEl.value.trim();
  const key = sbKeyEl.value.trim();
  const email = sbEmailEl.value.trim();
  const password = sbPasswordEl.value;
  if (!url || !key || !email || !password) throw new Error('Missing URL/key/email/password');
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  sbSession = await res.json();
  await setStorage({ SB_SESSION: sbSession, SB_CFG_KEY: { url, key, email } });
}

async function sbRefreshSessionIfNeeded() {
  const url = sbUrlEl.value.trim();
  const key = sbKeyEl.value.trim();
  if (!sbSession || !sbSession.refresh_token) return;
  // Lightweight endpoint to verify access_token: get user
  const res = await fetch(`${url}/auth/v1/user`, { headers: { 'apikey': key, 'Authorization': `Bearer ${sbSession.access_token}` } });
  if (res.ok) return; // still valid
  // Refresh
  const r = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: sbSession.refresh_token })
  });
  if (!r.ok) throw new Error('Failed to refresh session');
  sbSession = await r.json();
  await setStorage({ SB_SESSION: sbSession });
}

async function ensureDefaultBlocklist() {
  const lists = await sbRequest('blocklists?select=*&is_default=eq.true');
  if (Array.isArray(lists) && lists.length > 0) { sbDefaultBlocklistId = lists[0].id; return; }
  const created = await sbRequest('blocklists', { method: 'POST', body: { name: 'Default', is_default: true } });
  if (Array.isArray(created) && created.length > 0) sbDefaultBlocklistId = created[0].id;
}

async function pullBlocklistFromCloud() {
  if (!sbSession) throw new Error('Not signed in');
  await ensureDefaultBlocklist();
  if (!sbDefaultBlocklistId) throw new Error('No default blocklist');
  const items = await sbRequest(`blocklist_items?select=pattern&blocklist_id=eq.${sbDefaultBlocklistId}`);
  const domains = (items || []).map(r => (r.pattern || '').trim()).filter(Boolean);
  await setStorage({ [KEY]: domains });
  render(domains);
}

async function pushBlocklistToCloud() {
  if (!sbSession) throw new Error('Not signed in');
  await ensureDefaultBlocklist();
  if (!sbDefaultBlocklistId) throw new Error('No default blocklist');
  const list = await loadList();
  // Replace remote items: delete all then insert
  await sbRequest(`blocklist_items?blocklist_id=eq.${sbDefaultBlocklistId}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
  if (list.length > 0) {
    const rows = list.map(pattern => ({ blocklist_id: sbDefaultBlocklistId, pattern }));
    await sbRequest('blocklist_items', { method: 'POST', body: rows });
  }
}

sbSignInBtn?.addEventListener('click', async () => {
  try {
    setSbStatus('Signing in…');
    await saveSupabaseConfig();
    await sbSignIn();
    setSbStatus('Signed in. Syncing…');
    await pullBlocklistFromCloud();
    setSbStatus('Synced from cloud.');
  } catch (e) {
    setSbStatus(String(e));
  }
});

sbSignOutBtn?.addEventListener('click', async () => {
  sbSession = null; sbDefaultBlocklistId = null;
  await setStorage({ SB_SESSION: null });
  setSbStatus('Signed out.');
});

sbRefreshBtn?.addEventListener('click', async () => {
  try {
    setSbStatus('Refreshing…');
    const sess = await getStorage(['SB_SESSION']);
    sbSession = sess['SB_SESSION'] || null;
    if (!sbSession) throw new Error('Please sign in first');
    await sbRefreshSessionIfNeeded();
    await pullBlocklistFromCloud();
    setSbStatus('Refreshed from cloud.');
  } catch (e) {
    setSbStatus(String(e));
  }
});

// Try load stored session on start
(async function initSession() {
  const sess = await getStorage(['SB_SESSION']);
  sbSession = sess['SB_SESSION'] || null;
  if (sbSession) setSbStatus('Loaded saved session.');
})();