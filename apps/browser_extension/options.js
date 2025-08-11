const KEY = 'blocklist';
const listEl = document.getElementById('list');
const inputEl = document.getElementById('domain');
const addBtn = document.getElementById('add');

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
})();