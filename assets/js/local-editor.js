/* ============================================================
   local-editor.js — CRUD editor for data/shortcuts.json
   All functions exposed globally (no modules) so onclick= works.
   ============================================================ */

const state = {
  data:       null,   // parsed JSON object
  fileHandle: null,   // FileSystemFileHandle if File Access API used
  lastHandle: null,   // stored handle from previous session (needs permission)
  history:    [],     // cached from data/history.json
  dirty:      false,
  editingId:  null,
  isNew:      false,
};

const HAS_FILE_ACCESS = 'showOpenFilePicker' in window;

// ── History (data/history.json) ──────────────────────────────

async function readHistory() {
  try {
    const res = await fetch('./data/history.json');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.history) ? data.history : [];
  } catch { return []; }
}

async function writeHistory(entries) {
  const handle = await restoreHandle('history-file');
  if (!handle) return;
  try {
    const w = await handle.createWritable();
    await w.write(JSON.stringify({ history: entries }, null, 2));
    await w.close();
  } catch { /* ignore */ }
}

async function addToHistory(name) {
  const hist = (await readHistory()).filter(h => h.name !== name);
  hist.unshift({ name, openedAt: new Date().toISOString() });
  const trimmed = hist.slice(0, 10);
  state.history = trimmed;
  await writeHistory(trimmed);
}

// ── Handle Persistence (IndexedDB) ───────────────────────────

async function getDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('quick-links', 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });
}

async function persistHandle(handle, key = 'last') {
  try {
    const db = await getDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, key);
  } catch { /* ignore */ }
}

async function restoreHandle(key = 'last') {
  try {
    const db = await getDB();
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(key);
    return await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  } catch { return null; }
}

async function setupHistoryFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    if (handle.name !== 'history.json') {
      showToast('Vui lòng chọn đúng file history.json');
      return;
    }
    await persistHandle(handle, 'history-file');
    showToast('Đã liên kết history.json');
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Lỗi: ' + err.message);
  }
}

// ── Utilities ───────────────────────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function generateId(title) {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics (handles Vietnamese)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
  return slug || `shortcut-${Date.now()}`;
}

function isValidUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}

let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ── File I/O ─────────────────────────────────────────────────

async function loadFromHandle(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  state.data       = JSON.parse(text);
  state.fileHandle = handle;
  state.lastHandle = null;
  state.dirty      = false;
  state.editingId  = null;
  state.isNew      = false;
  renderAll();
}

async function openFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    await loadFromHandle(handle);
    await persistHandle(handle);
    await addToHistory(handle.name);
    showToast('Đã mở: ' + handle.name);
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Lỗi mở file: ' + err.message);
  }
}

async function reopenLast() {
  if (!state.lastHandle) return;
  try {
    await state.lastHandle.requestPermission({ mode: 'readwrite' });
    await loadFromHandle(state.lastHandle);
    await persistHandle(state.lastHandle);
    await addToHistory(state.lastHandle.name);
    showToast('Đã mở lại: ' + state.fileHandle.name);
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Không thể mở lại: ' + err.message);
  }
}

async function tryReopenLast() {
  if (!HAS_FILE_ACCESS) return;
  state.history = await readHistory();
  const last = state.history[0];
  if (!last) return;
  const handle = await restoreHandle('last');
  if (!handle) return;
  state.lastHandle = handle;
  renderAll();
}

function importFile() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      state.data       = JSON.parse(text);
      state.fileHandle = null;
      state.dirty      = false;
      state.editingId  = null;
      state.isNew      = false;
      renderAll();
      showToast('Import thành công');
    } catch (err) {
      showToast('JSON không hợp lệ: ' + err.message);
    }
  };
  input.click();
}

async function saveFile() {
  if (!state.data) return;
  state.data.updatedAt = today();
  const json = JSON.stringify(state.data, null, 2);

  if (state.fileHandle) {
    try {
      const writable = await state.fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      state.dirty = false;
      renderAll();
      showToast('Đã lưu vào file');
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Lưu thất bại: ' + err.message);
    }
  } else {
    downloadJson(json);
  }
}

function exportFile() {
  if (!state.data) return;
  state.data.updatedAt = today();
  downloadJson(JSON.stringify(state.data, null, 2));
}

function downloadJson(json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'shortcuts.json';
  a.click();
  URL.revokeObjectURL(url);
  state.dirty = false;
  renderAll();
  showToast('Đã export JSON');
}

// ── CRUD ─────────────────────────────────────────────────────

function addNew() {
  state.editingId = null;
  state.isNew     = true;
  renderAll();
}

function editItem(id) {
  state.editingId = id;
  state.isNew     = false;
  renderAll();
}

function deleteItem(id) {
  if (!confirm('Xóa shortcut này?')) return;
  state.data.shortcuts = state.data.shortcuts.filter(s => s.id !== id);
  if (state.editingId === id) { state.editingId = null; state.isNew = false; }
  state.dirty = true;
  renderAll();
  showToast('Đã xóa');
}

function submitForm(e) {
  e.preventDefault();
  const form = e.target;

  const title = form.title.value.trim();
  const url   = form.url.value.trim();

  if (!title) { showToast('Title là bắt buộc'); return; }

  if (!isValidUrl(url)) {
    form.url.classList.add('invalid');
    showToast('URL không hợp lệ');
    return;
  }
  form.url.classList.remove('invalid');

  const repoUrl = form.repoUrl.value.trim();
  if (repoUrl && !isValidUrl(repoUrl)) {
    form.repoUrl.classList.add('invalid');
    showToast('Repo URL không hợp lệ');
    return;
  }
  form.repoUrl.classList.remove('invalid');

  const fields = {
    title,
    description: form.description.value.trim(),
    url,
    icon:    form.icon.value.trim(),
    group:   form.group.value.trim() || 'General',
    enabled: form.enabled.checked,
    order:   parseInt(form.order.value, 10) || 1,
  };
  if (repoUrl) fields.repoUrl = repoUrl;

  if (state.isNew) {
    const existingIds = new Set(state.data.shortcuts.map(s => s.id));
    let id = generateId(title), suffix = 2;
    while (existingIds.has(id)) id = `${generateId(title)}-${suffix++}`;
    state.data.shortcuts.push({ id, ...fields });
    state.editingId = id;
    state.isNew     = false;
    showToast('Đã thêm shortcut');
  } else {
    const idx = state.data.shortcuts.findIndex(s => s.id === state.editingId);
    if (idx >= 0) state.data.shortcuts[idx] = { ...state.data.shortcuts[idx], ...fields };
    showToast('Đã cập nhật');
  }

  state.dirty = true;
  renderAll();
}

function cancelForm() {
  state.editingId = null;
  state.isNew     = false;
  renderAll();
}

// Called from oninput on title field when creating new item
function previewId(title) {
  const el = document.getElementById('id-preview');
  if (el) el.textContent = 'ID: ' + (generateId(title) || '(nhập title)');
}

// ── Render ────────────────────────────────────────────────────

function renderAll() {
  renderList();
  renderPanel();
  renderStatusBar();
  updateHeaderButtons();
}

function updateHeaderButtons() {
  const btnOpen   = document.getElementById('btn-open');
  const btnExport = document.getElementById('btn-export');
  const btnSave   = document.getElementById('btn-save');
  const btnAdd    = document.getElementById('btn-add');
  const saveLabel = document.getElementById('btn-save-label');

  if (btnOpen)   btnOpen.style.display = HAS_FILE_ACCESS ? '' : 'none';
  if (btnExport) btnExport.disabled = !state.data;
  if (btnAdd)    btnAdd.disabled    = !state.data;
  if (btnSave) {
    btnSave.disabled = !state.data;
    if (saveLabel) saveLabel.textContent = state.fileHandle ? 'Save to File' : 'Export JSON';
  }
}

function renderList() {
  const listEl = document.getElementById('shortcut-list');

  if (!state.data || !Array.isArray(state.data.shortcuts)) {
    listEl.innerHTML = '<div class="shortcut-list-empty">Chưa có dữ liệu.<br>Mở hoặc import file shortcuts.json.</div>';
    return;
  }

  const sorted = [...state.data.shortcuts].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="shortcut-list-empty">Chưa có shortcut nào.<br>Nhấn "Add" để tạo mới.</div>';
    return;
  }

  listEl.innerHTML = sorted.map(item => {
    const initial = (item.title || '?').charAt(0).toUpperCase();
    const isActive = !state.isNew && state.editingId === item.id;
    return `
      <div class="shortcut-list-item ${isActive ? 'active' : ''}"
           data-id="${escapeHtml(item.id)}"
           onclick="editItem('${escapeHtml(item.id)}')">
        <div class="item-icon" data-initial="${escapeHtml(initial)}">
          <img src="${escapeHtml(item.icon)}" alt=""
               onerror="this.parentElement.classList.add('icon-fallback')">
        </div>
        <div class="item-info">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-meta">${escapeHtml(item.group || '')} · #${item.order ?? '?'}</div>
        </div>
        <span class="badge ${item.enabled ? 'badge-enabled' : 'badge-disabled'}">
          ${item.enabled ? 'on' : 'off'}
        </span>
      </div>`;
  }).join('');
}

function renderPanel() {
  const panel = document.getElementById('editor-panel');

  if (!state.data) {
    panel.innerHTML = buildWelcome();
    return;
  }

  if (state.isNew) {
    panel.innerHTML = buildForm(null);
    return;
  }

  if (state.editingId) {
    const item = state.data.shortcuts.find(s => s.id === state.editingId);
    if (item) { panel.innerHTML = buildForm(item); return; }
  }

  panel.innerHTML = `
    <div class="editor-welcome" style="min-height:260px;">
      <p>Chọn một shortcut để chỉnh sửa, hoặc nhấn <strong>+ Add</strong> để tạo mới.</p>
    </div>`;
}

function buildWelcome() {
  const last = state.history[0];

  return `
    <div class="editor-welcome">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
           style="color:var(--text-muted);">
        <path stroke-linecap="round" stroke-linejoin="round"
              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757
                 m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/>
      </svg>
      <h2>Quick Links Editor</h2>

      ${last ? `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:10px 14px;
                    background:var(--bg-hover);border-radius:8px;font-size:13px;">
          <span style="color:var(--text-muted);">Gần đây:</span>
          <strong>${escapeHtml(last.name)}</strong>
          ${state.lastHandle
            ? `<button class="btn btn-primary btn-sm" onclick="reopenLast()" style="margin-left:auto;">Cấp quyền & Mở</button>`
            : ''}
        </div>` : ''}

      <p>Mở file <code>data/shortcuts.json</code> để bắt đầu chỉnh sửa shortcuts.</p>
      <div class="welcome-actions">
        ${HAS_FILE_ACCESS ? `<button class="btn btn-primary" onclick="openFile()">Mở shortcuts.json</button>` : ''}
        <button class="btn" onclick="importFile()">Import JSON</button>
        ${HAS_FILE_ACCESS ? `<button class="btn btn-sm" onclick="setupHistoryFile()" title="Liên kết history.json để ghi lịch sử tự động">⚙ History</button>` : ''}
      </div>
      ${!HAS_FILE_ACCESS
        ? '<p style="font-size:11px;color:var(--text-muted);">Browser không hỗ trợ File System API. Dùng Import/Export.</p>'
        : ''}
    </div>`;
}

function buildForm(item) {
  const isNew = !item;
  const v     = (field, fallback = '') => escapeHtml(item?.[field] ?? fallback);
  return `
    <div class="form-card">
      <h2>${isNew ? 'Thêm Shortcut Mới' : 'Chỉnh Sửa Shortcut'}</h2>
      <form id="shortcut-form" onsubmit="submitForm(event)">

        ${!isNew ? `
          <div class="form-group">
            <label>ID</label>
            <input type="text" value="${v('id')}" readonly>
            <div class="hint">Tự sinh từ title khi tạo mới. Không thể thay đổi.</div>
          </div>` : ''}

        <div class="form-group">
          <label>Title *</label>
          <input type="text" name="title" value="${v('title')}" required
                 placeholder="Tên ứng dụng / trang web"
                 ${isNew ? 'oninput="previewId(this.value)"' : ''}>
          ${isNew ? '<div class="hint" id="id-preview">ID: (nhập title)</div>' : ''}
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea name="description" placeholder="Mô tả ngắn...">${escapeHtml(item?.description || '')}</textarea>
        </div>

        <div class="form-group">
          <label>URL *</label>
          <input type="text" name="url" value="${v('url')}" required placeholder="https://example.com">
        </div>

        <div class="form-group">
          <label>Repo URL <span style="font-weight:400;color:var(--text-muted)">(tuỳ chọn)</span></label>
          <input type="text" name="repoUrl" value="${v('repoUrl')}" placeholder="https://github.com/user/repo">
        </div>

        <div class="form-group">
          <label>Icon (đường dẫn tương đối)</label>
          <input type="text" name="icon" value="${v('icon')}" placeholder="assets/icons/myapp.png">
          <div class="hint">Tương đối từ thư mục gốc project. Bỏ trống để dùng chữ cái đầu.</div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Group</label>
            <input type="text" name="group" value="${v('group', 'General')}" placeholder="Learning">
          </div>
          <div class="form-group">
            <label>Order</label>
            <input type="number" name="order" value="${item?.order ?? 1}" min="1">
          </div>
        </div>

        <div class="form-group">
          <label>Hiển thị</label>
          <div class="toggle-row">
            <label class="toggle">
              <input type="checkbox" name="enabled" ${(item?.enabled !== false) ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <span class="toggle-label">Hiện shortcut này trên trang public</span>
          </div>
        </div>

        <div class="form-actions">
          ${!isNew ? `
            <button type="button" class="btn btn-danger btn-sm"
                    onclick="deleteItem('${escapeHtml(item.id)}')">Xóa</button>` : ''}
          <div class="spacer"></div>
          <button type="button" class="btn btn-sm" onclick="cancelForm()">Hủy</button>
          <button type="submit" class="btn btn-primary btn-sm">
            ${isNew ? 'Thêm' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </div>`;
}

function renderStatusBar() {
  const bar = document.getElementById('status-bar');
  if (!state.data) {
    bar.innerHTML = '<span>Chưa mở file nào</span>';
    return;
  }
  const count    = state.data.shortcuts?.length ?? 0;
  const filename = state.fileHandle ? state.fileHandle.name : 'Imported';
  bar.innerHTML = `
    <span class="status-dot ${state.dirty ? 'dirty' : ''}"></span>
    <span>${escapeHtml(filename)}</span>
    <span>·</span>
    <span>${count} shortcut${count !== 1 ? 's' : ''}</span>
    ${state.dirty ? '<span>· Có thay đổi chưa lưu</span>' : ''}
    ${state.data.updatedAt ? `<span>· Cập nhật ${escapeHtml(state.data.updatedAt)}</span>` : ''}`;
}

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  renderAll();
  await tryReopenLast();
});
