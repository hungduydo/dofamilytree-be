# Import ảnh từ Google Drive

Người dùng chọn ảnh trên Google Drive, **server tự kéo file từ Drive về storage** (R2/Blob).
Máy người dùng không tải xuống / upload lên gì cả — 100 ảnh × 25MB chỉ mất vài phút.

```
FE (Google Picker) ──file_ids + access_token──▶ POST /v2/media/import/google-drive
                                                   │ đọc metadata, tạo record pending
                                                   │ token → Redis (TTL 1h)
                                                   ▼
                                        QStash: 1 job / file  (dev: chạy thẳng trong process)
                                                   │ Drive API alt=media → sharp → storage
                                                   ▼
FE poll GET /v2/media/:id/progress ◀── pending → processing → ready | failed
```

## 1. Cấu hình Google Cloud (một lần)

1. Google Cloud Console → tạo/chọn project → **APIs & Services → Library**: bật
   **Google Drive API** và **Google Picker API**.
2. **OAuth consent screen**: loại *External*, thêm scope
   `https://www.googleapis.com/auth/drive.file` (scope "non-sensitive" — không cần
   Google xét duyệt app). Khi còn ở chế độ *Testing*, thêm email người dùng vào *Test users*.
3. **Credentials**:
   - *OAuth client ID* loại **Web application**, *Authorized JavaScript origins* =
     domain FE (vd `https://giapha.example`, `http://localhost:3001`).
   - *API key* — giới hạn *HTTP referrers* = domain FE, *API restrictions* = Google Picker API.
4. Đưa vào env **của FE**: `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, `GOOGLE_APP_ID`
   (= *project number*, cần để Picker cấp quyền `drive.file` cho file được chọn).

Backend **không cần** env Google nào — nó chỉ dùng access token người dùng gửi lên.

## 2. Phía FE

```ts
// 1) Lấy access token (Google Identity Services: https://accounts.google.com/gsi/client)
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: GOOGLE_CLIENT_ID,
  scope: 'https://www.googleapis.com/auth/drive.file',
  callback: ({ access_token }) => openPicker(access_token),
});
tokenClient.requestAccessToken();

// 2) Mở Picker (https://apis.google.com/js/api.js → gapi.load('picker'))
function openPicker(accessToken: string) {
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
    .setIncludeFolders(true)        // duyệt được vào thư mục
    .setSelectFolderEnabled(false); // nhưng chỉ chọn file
  new google.picker.PickerBuilder()
    .setAppId(GOOGLE_APP_ID)
    .setOAuthToken(accessToken)
    .setDeveloperKey(GOOGLE_API_KEY)
    .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
    .enableFeature(google.picker.Feature.SUPPORT_DRIVES) // Shared drives
    .addView(view)
    .addView(new google.picker.DocsView().setOwnedByMe(false)) // "Được chia sẻ với tôi"
    .setCallback(async (data) => {
      if (data.action !== google.picker.Action.PICKED) return;
      const res = await api.post('/v2/media/import/google-drive', {
        access_token: accessToken,
        file_ids: data.docs.map((d) => d.id),
        album_id, // tuỳ chọn: member_id, event_id, tags, uploader_name
      });
      // res.accepted → poll progress từng media_id; res.rejected → hiện lý do
    })
    .build()
    .setVisible(true);
}
```

Trong Picker, người dùng mở thư mục rồi **Ctrl/Cmd + A** để chọn hết ảnh. Picker không
cho chọn cả thư mục (scope `drive.file` chỉ cấp quyền cho từng file được chọn).

## 3. API

`POST /v2/media/import/google-drive` — role `member`.

| Trường | Kiểu | |
| --- | --- | --- |
| `access_token` | string | Bắt buộc. Token Google từ bước 1. |
| `file_ids` | string[] | Bắt buộc, 1–200 ID, trùng lặp bị gộp. |
| `album_id`, `member_id`, `event_id` | uuid | Tuỳ chọn, áp cho mọi file. |
| `tags` | string[] | Tuỳ chọn. |
| `uploader_name` | string | Tuỳ chọn (đăng hộ). |

Response `201`:

```json
{
  "batch_id": "…",
  "accepted": [
    { "media_id": "…", "drive_file_id": "…", "filename": "IMG_0001.jpg", "mime_type": "image/jpeg", "size_bytes": 26214400 }
  ],
  "rejected": [
    { "drive_file_id": "…", "reason": "unsupported_type", "message": "\"Ảnh cũ\" là thư mục — hãy mở thư mục và chọn các ảnh bên trong." }
  ]
}
```

`reason` của `rejected`: `not_found` (xoá/mất quyền), `unsupported_type` (thư mục,
Google Docs, định dạng ngoài allowlist), `too_large` (> 100MB), `trashed`,
`drive_unavailable` (Drive lỗi tạm — gửi lại file đó), `enqueue_failed` (QStash lỗi — gửi lại).
`message` là tiếng Việt, hiển thị thẳng được.

Lỗi:

- `400` — `access_token` sai/hết hạn (cố ý **không** dùng 401 để FE không đăng xuất
  người dùng khỏi app). FE xin token mới rồi gửi lại.
- `503` — Redis không lưu được token; thử lại sau.

Theo dõi: `GET /v2/media/:id/progress` cho từng `media_id` (như luồng upload thường).
`failed` kèm `error`, ví dụ "Phiên Google Drive đã hết hạn — hãy chọn lại ảnh để import."

## 4. Vận hành

- **Token**: lưu ở Redis key `media:drive-import:token:<batch_id>`, TTL 1 giờ, không
  nằm trong payload QStash. Không lưu refresh token. Job chạy sau khi token hết hạn ⇒
  `failed` (`token_expired`), người dùng import lại.
- **Retry**: lỗi tạm (mạng, 429/5xx Drive, storage) ⇒ job ném lỗi để QStash retry; lỗi
  vĩnh viễn (401/403/404, quá lớn) ⇒ `failed` luôn. QStash giao lặp với media đã `ready` là no-op.
- **Dev-local / không có QStash**: khi thiếu `QSTASH_TOKEN` hoặc `APP_URL` là localhost,
  job chạy thẳng trong process (3 file song song). Trên Vercel mà không có QStash, cách
  này bị giới hạn bởi `maxDuration` (300s) — production nên luôn có QStash.
- **Bộ nhớ**: mỗi job tải trọn file vào RAM để nén bằng sharp — vì vậy trần 100MB/file.
  Video lớn hơn: tải về rồi dùng `POST /v2/media/upload-url`.
- **Log** (Sentry): `media.drive_import.requested`, `media.drive_import.failed` — xem
  `SENTRY_LOG_EVENTS.md`.
- **Chưa có**: chống import trùng (cùng một file Drive import 2 lần ⇒ 2 media). Cần thêm
  cột `drive_file_id` vào bảng `media` nếu muốn chặn.
