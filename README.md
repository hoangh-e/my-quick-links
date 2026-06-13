# my-quick-links

Trang web cá nhân tổng hợp quick links — publish bằng GitHub Pages, chỉnh sửa bằng local editor, và truy cập nhanh bằng browser extension.

**Production URL:** https://hoangh-e.github.io/my-quick-links/  
**Data URL:** https://hoangh-e.github.io/my-quick-links/data/shortcuts.json

---

## Cấu trúc project

```
my-quick-links/
├── index.html              # Trang public (GitHub Pages)
├── index-local.html        # Editor local để CRUD data
├── data/
│   └── shortcuts.json      # Nguồn dữ liệu duy nhất (dùng chung)
├── assets/
│   ├── css/
│   │   └── app.css         # Shared styles (dark/light mode)
│   ├── js/
│   │   ├── app.js          # Logic cho index.html
│   │   └── local-editor.js # Logic CRUD cho index-local.html
│   └── icons/              # Icon cho từng shortcut (.png)
└── extension/
    ├── manifest.json       # Manifest V3
    ├── popup.html
    ├── popup.css
    ├── popup.js
    └── icons/              # Icon của extension (16/32/48/128px)
```

---

## Chạy local

### 1. Khởi động local server

```bash
# Python 3
python -m http.server 8000

# Hoặc Node.js (nếu có npx)
npx serve .
```

### 2. Mở web public

```
http://localhost:8000/
```

Trang hiển thị danh sách shortcuts từ `data/shortcuts.json`.  
Chỉ hiển thị item có `enabled: true`, sắp xếp theo `order`.

### 3. Mở local editor

```
http://localhost:8000/index-local.html
```

> **Lưu ý:** Editor phải chạy qua HTTP server (không phải `file://`) để File System Access API hoạt động trên một số browser.

---

## Chỉnh sửa data (`index-local.html`)

1. **Mở file:** Nhấn **"Mở File"** (Chrome/Edge) → chọn `data/shortcuts.json`  
   _Hoặc_ nhấn **"Import JSON"** nếu browser không hỗ trợ File System API.
2. **Thêm shortcut:** Nhấn **"+ Add"** → điền form → nhấn **"Thêm"**
3. **Sửa shortcut:** Click vào item trong danh sách bên trái → chỉnh sửa → **"Lưu thay đổi"**
4. **Xóa shortcut:** Mở form edit → nhấn **"Xóa"** ở góc dưới trái
5. **Lưu lại:**
   - Nếu đã mở file qua File System API → nhấn **"Save to File"** (ghi thẳng vào file)
   - Nếu dùng Import → nhấn **"Export JSON"** → tải về → thay thế file `data/shortcuts.json`

### Schema shortcut

```json
{
  "id": "my-app",
  "title": "Tên ứng dụng",
  "description": "Mô tả ngắn",
  "url": "https://example.com",
  "repoUrl": "https://github.com/user/repo",
  "icon": "assets/icons/my-app.png",
  "group": "Learning",
  "enabled": true,
  "order": 1
}
```

- `id` — tự sinh từ title (slug), không sửa được sau khi tạo
- `icon` — đường dẫn tương đối từ thư mục gốc; để trống sẽ dùng chữ cái đầu của title
- `enabled` — `false` để ẩn khỏi trang public mà không xóa
- `updatedAt` — tự cập nhật khi save

---

## Thêm icon cho shortcut

Đặt file PNG vào `assets/icons/`, ví dụ `assets/icons/my-app.png`, rồi điền đường dẫn đó vào field **Icon** trong editor.

Kích thước đề xuất: **128×128 px** trở lên, định dạng PNG.

---

## Push lên GitHub Pages

```bash
git add data/shortcuts.json
# Hoặc nếu có thêm icon mới:
git add data/ assets/icons/

git commit -m "chore: update shortcuts"
git push
```

GitHub Pages sẽ tự động deploy sau vài phút.

### Bật GitHub Pages (lần đầu)

1. Vào repo → **Settings** → **Pages**
2. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`
3. Nhấn **Save**
4. Đợi ~1 phút rồi vào `https://hoangh-e.github.io/my-quick-links/`

---

## Browser Extension (Chrome / Edge)

### Cài extension (Developer Mode)

1. Mở `chrome://extensions/` (hoặc `edge://extensions/`)
2. Bật **Developer mode** (góc trên phải)
3. Nhấn **"Load unpacked"**
4. Chọn thư mục `extension/` trong project này
5. Extension xuất hiện trên thanh toolbar

### Thêm icon cho extension (tuỳ chọn)

Tạo 4 file PNG và đặt vào `extension/icons/`:

| File          | Kích thước |
|---------------|-----------|
| `icon16.png`  | 16×16 px  |
| `icon32.png`  | 32×32 px  |
| `icon48.png`  | 48×48 px  |
| `icon128.png` | 128×128 px|

Sau đó thêm vào `extension/manifest.json`:

```json
"icons": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
},
"action": {
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png"
  }
}
```

### Cách hoạt động của extension

- Fetch data từ `https://hoangh-e.github.io/my-quick-links/data/shortcuts.json`
- Cache vào `chrome.storage.local` (TTL 1 giờ)
- Nếu mất mạng → hiển thị từ cache cũ
- Nhấn icon **↺** để refresh thủ công
- Click shortcut → mở tab mới

---

## Workflow tổng quan

```
Chỉnh sửa data   →  index-local.html (localhost:8000)
        ↓
  git commit + push
        ↓
  GitHub Pages auto-deploy
        ↓
  index.html  →  fetch data từ GitHub Pages
  Extension   →  fetch data từ GitHub Pages (có cache)
```
