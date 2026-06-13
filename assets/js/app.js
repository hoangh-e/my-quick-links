const DATA_URL = 'data/shortcuts.json';

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

function renderCard(item) {
  const initial = (item.title || '?').charAt(0).toUpperCase();
  return `
    <a href="${escapeHtml(item.url)}"
       target="_blank"
       rel="noopener noreferrer"
       class="card"
       title="${escapeHtml(item.description)}">
      <div class="card-icon" data-initial="${escapeHtml(initial)}">
        <img src="${escapeHtml(item.icon)}"
             alt="${escapeHtml(item.title)}"
             onerror="this.parentElement.classList.add('icon-fallback')">
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.title)}</div>
        <div class="card-desc">${escapeHtml(item.description)}</div>
      </div>
    </a>`;
}

function renderGroup(name, items) {
  return `
    <section class="group">
      <h2 class="group-title">${escapeHtml(name)}</h2>
      <div class="cards-grid">
        ${items.map(renderCard).join('')}
      </div>
    </section>`;
}

async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error');
  const contentEl = document.getElementById('content');

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.statusText}`);
    const data = await res.json();

    const items = (data.shortcuts || [])
      .filter(s => s.enabled)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    loadingEl.hidden = true;

    if (items.length === 0) {
      contentEl.innerHTML = '<p class="state-empty">No shortcuts found.</p>';
    } else {
      const groups = groupBy(items, 'group');
      contentEl.innerHTML = Object.entries(groups)
        .map(([name, groupItems]) => renderGroup(name, groupItems))
        .join('');
    }

    contentEl.hidden = false;
  } catch (err) {
    loadingEl.hidden = true;
    errorEl.textContent = 'Failed to load shortcuts: ' + err.message;
    errorEl.hidden = false;
  }
}

init();
