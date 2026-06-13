const DATA_URL    = 'https://hoangh-e.github.io/my-quick-links/data/shortcuts.json';
const ICON_BASE   = 'https://hoangh-e.github.io/my-quick-links/';
const CACHE_KEY   = 'quicklinks_cache';
const CACHE_TTL   = 60 * 60 * 1000; // 1 hour

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function groupBy(items, key) {
  const result = {};
  for (const item of items) {
    const g = item[key] || 'Other';
    if (!result[g]) result[g] = [];
    result[g].push(item);
  }
  return result;
}

function resolveIcon(iconPath) {
  if (!iconPath) return '';
  if (iconPath.startsWith('http')) return iconPath;
  return ICON_BASE + iconPath;
}

async function fetchRemote() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function readCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(CACHE_KEY, r => resolve(r[CACHE_KEY] || null));
  });
}

function writeCache(data) {
  chrome.storage.local.set({ [CACHE_KEY]: { data, ts: Date.now() } });
}

function renderContent(data, fromCache) {
  const contentEl     = document.getElementById('content');
  const cacheNoticeEl = document.getElementById('cache-notice');

  const items = (data.shortcuts || [])
    .filter(s => s.enabled)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  if (items.length === 0) {
    contentEl.innerHTML = '<div class="popup-state">No shortcuts found.</div>';
    contentEl.hidden = false;
    return;
  }

  const groups = groupBy(items, 'group');
  let html = '';

  for (const [name, groupItems] of Object.entries(groups)) {
    html += `<div class="group-header">${escapeHtml(name)}</div>`;
    for (const item of groupItems) {
      const iconUrl = resolveIcon(item.icon);
      const initial = (item.title || '?').charAt(0).toUpperCase();
      html += `
        <div class="link-item" data-url="${escapeHtml(item.url)}">
          <div class="link-icon" data-initial="${escapeHtml(initial)}">
            ${iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="" onerror="this.parentElement.classList.add('icon-fallback')">` : ''}
          </div>
          <div class="link-info">
            <div class="link-title">${escapeHtml(item.title)}</div>
            <div class="link-desc">${escapeHtml(item.description)}</div>
          </div>
        </div>`;
    }
  }

  contentEl.innerHTML = html;
  contentEl.hidden = false;

  if (fromCache) cacheNoticeEl.hidden = false;

  contentEl.querySelectorAll('.link-item[data-url]').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  });
}

function showState(id, msg) {
  document.getElementById('loading').hidden = true;
  document.getElementById('error').hidden   = true;
  if (id === 'error') {
    const el = document.getElementById('error');
    el.textContent = msg;
    el.hidden = false;
  }
}

async function load(forceRefresh) {
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('spinning');

  try {
    const data = await fetchRemote();
    writeCache(data);
    document.getElementById('loading').hidden = true;
    renderContent(data, false);
  } catch (err) {
    const cached = await readCache();
    if (cached) {
      document.getElementById('loading').hidden = true;
      renderContent(cached.data, true);
    } else {
      showState('error', 'Failed to load: ' + err.message);
    }
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

document.getElementById('refresh-btn').addEventListener('click', () => load(true));

(async () => {
  const cached = await readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    document.getElementById('loading').hidden = true;
    renderContent(cached.data, false);
    // silent background refresh
    fetchRemote().then(data => { writeCache(data); renderContent(data, false); }).catch(() => {});
  } else {
    load(false);
  }
})();
