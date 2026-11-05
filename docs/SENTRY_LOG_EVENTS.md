# Thiết kế Sentry Logs — danh mục sự kiện

> Trạng thái: bước 1–2 (helper + P0) **đã triển khai**; P1/P2 còn là đề xuất.
> Quy tắc viết log chung xem `docs/SENTRY_LOGS.md`. Helper: `src/observability/log-event.ts`.

## 1. Mỗi tín hiệu một việc

| Tín hiệu | Trả lời câu hỏi | Đã có |
| --- | --- | --- |
| **Errors** (`SentryGlobalFilter`) | "Có gì vỡ bất ngờ?" — exception không phải `HttpException` | ✅ |
| **Traces** | "Request nào chậm, chậm ở đâu?" — mọi request, span DB/Redis/HTTP | ✅ |
| **Audit log (DB)** | "Ai đổi gì trong gia phả?" — `member`, `relationship`; người dùng xem được, khôi phục được | ✅ |
| **Sentry Logs** | "Hệ thống đã làm gì / từ chối gì / suy giảm ở đâu?" — vận hành + bảo mật | một phần |

Hệ quả cho Logs:

- **Không** log mỗi request, không log đọc (GET) — traces đã có.
- **Không** log CRUD đã có audit DB (member, relationship) — trùng lặp.
- **Có** log: kết quả job nền, lỗi đã xử lý (catch rồi chạy tiếp), từ chối bảo mật,
  thao tác quản trị tài khoản (chưa có audit), suy giảm hạ tầng.

## 2. Quy ước

- **`event.name`** (bắt buộc) — tên ổn định, dạng `<miền>.<đối tượng>.<kết quả>`, ví dụ
  `auth.login.failed`. Đây là khoá để lọc / alert; message có thể đổi câu chữ, `event.name` thì không.
- **Message** cố định, tiếng Anh; giá trị động đưa vào thuộc tính (hoặc `Sentry.logger.fmt`).
- **Thuộc tính chung theo request**: đặt một lần trên isolation scope khi xác thực xong
  (`JwtStrategy.validate`) → mọi log trong request tự có `user.id`, `user.roles`.
  `trace_id`, `environment`, `release` SDK tự gắn.
- **Người thao tác vs đối tượng**: `user.id` = người gọi API; đối tượng bị tác động dùng
  `target.user.id`, `member.id`, `media.id`…
- **`*.reason`** là mã liệt kê (`invalid_credentials`, `deactivated`…), không phải câu lỗi tự do.
- **Lỗi**: `error.type` (tên class) + `error.message` (đã qua `scrubLog`).
- **Không PII**: không email, tên, nội dung thư, IP, token. Cần đối chiếu người thì dùng `user.id` (UUID).
- **Chống lụt**: sự kiện có thể lặp theo từng request khi hạ tầng hỏng (`cache.degraded`)
  đi qua helper throttle — tối đa 1 log / phút / (event, op) / instance, kèm `throttle.suppressed`.

Helper đề xuất: `src/observability/log-event.ts`

```ts
logEvent('auth.login.failed', 'warn', 'Login failed', { 'auth.reason': 'invalid_credentials' });
logEventThrottled('cache.degraded', 'warn', 'Cache degraded, serving from DB', { 'cache.operation': 'get' });
```

`logEvent` nhận `event.name` từ một union type (danh mục bên dưới) để tên không bị gõ sai/lệch.

## 3. Danh mục sự kiện

✅ đã có trong code · 🆕 đề xuất. Ưu tiên: **P0** bảo mật & lỗi đã xử lý, **P1** tóm tắt job / thao tác quản trị, **P2** đo đạc.

### 3.1 Xác thực & tài khoản (`auth`, `admin`)

| | Ưu tiên | `event.name` | Mức | Nơi | Thuộc tính |
| --- | --- | --- | --- | --- | --- |
| ✅ | P0 | `auth.login.failed` | warn (error khi `profile_missing`) | `AuthService.login` | `auth.reason`: `invalid_credentials` \| `deactivated` \| `profile_missing`; `auth.provider_code` (mã Supabase); `user.id` khi đã biết |
| ✅ | P0 | `auth.rate_limited` | warn | `AuthRateLimiter` | `rate_limit.policy`, `rate_limit.scope` (`ip`/`email` — chỉ loại, không giá trị), `rate_limit.window_s`, `rate_limit.max` |
| ✅ | P0 | `auth.forbidden` | warn | `RolesGuard` | `auth.reason` (`unauthenticated` \| `unknown_role_requirement` \| `insufficient_role`), `auth.required_roles`, `http.request.method`, `http.route` |
| 🆕 | P1 | `auth.register.pending` | info | `AuthService.register` | `user.id`, `auth.has_claim`, `auth.has_avatar` |
| 🆕 | P1 | `auth.password_reset.requested` | info | `forgotPassword` | `auth.outcome`: `sent` \| `mail_failed` (không phân biệt email có tồn tại) |
| 🆕 | P1 | `auth.password_reset.completed` | info | `resetPassword` | `user.id` |
| 🆕 | P1 | `auth.password.changed` | info | `changePassword` | `user.id`; sai mật khẩu cũ → `auth.password.change_failed` (warn) |
| ✅ | P0 | `admin.user.roles_changed` | info | `assignRoles` | `target.user.id`, `roles.before`, `roles.after` |
| ✅ | P0 | `admin.user.activation_changed` | info (warn khi khoá) | `setActive` | `target.user.id`, `user.active.before`, `user.active.after` |
| 🆕 | P1 | `admin.user.member_linked` / `…_unlinked` | info | `linkMember` / `unlinkMember` | `target.user.id`, `member.id` |

`admin.*` là nhật ký quản trị duy nhất cho tài khoản (audit DB chưa phủ). Nếu sau này
thêm `AUDIT_ENTITY.user`, giữ log nhưng hạ xuống chỉ để alert.

### 3.2 Hàng đợi & job nền (`queue`, `reminder`, `generation`, `report`)

| | Ưu tiên | `event.name` | Mức | Nơi | Thuộc tính |
| --- | --- | --- | --- | --- | --- |
| ✅ | P0 | `queue.signature.invalid` | warn | `QStashSignatureGuard` | `queue.reason`: `missing_signature` \| `missing_raw_body` \| `invalid_signature` \| `keys_not_configured` (cái cuối: **error**), `messaging.destination.name` |
| ✅ | — | `queue.task.unknown` | warn | `QueueController` | `messaging.system`, `messaging.destination.name` |
| 🆕 | P1 | `queue.task.completed` | info | `QueueController` (bọc switch) | `messaging.destination.name`, `queue.duration_ms`, `queue.outcome` (`ok` \| `failed`) — một log / callback |
| ✅ | P0 | `queue.publish.failed` | error | `QStashService.publish` | `messaging.destination.name`, `queue.delay_s`, `error.*` |
| ✅ | — | `reminder.run.completed` | info/warn | `AnniversaryReminderService` | bộ đếm `reminder.*` |
| ✅ | — | `reminder.mail_not_configured` / `reminder.recipient_skipped` / `reminder.send_failed` | error/warn/error | như trên | `target.user.id` (người nhận) |
| 🆕 | P1 | `generation.recompute.completed` | info (warn nếu có cảnh báo) | `GenerationService.recomputeAll` | `generation.members`, `generation.updated`, `generation.warnings`, `generation.duration_ms` |
| 🆕 | P2 | `report.generated` | info | `TasksService.handleReportGenerate` | `report.total_members`, `report.duration_ms` |

### 3.3 Media & lưu trữ (`media`, `avatar`, `storage`)

| | Ưu tiên | `event.name` | Mức | Nơi | Thuộc tính |
| --- | --- | --- | --- | --- | --- |
| ✅ | — | `media.processed` / `media.processing_failed` | info/error | `TasksService.handleMediaProcess` | `media.*`, `error.*` |
| 🆕 | P1 | `media.upload.rejected` | warn | `MulterErrorFilter`, allowlist MIME | `media.reason`: `too_large` \| `mime_not_allowed` \| …, `media.mime_type`, `media.input_bytes` |
| 🆕 | P1 | `media.presigned.completed` | info | `MediaService.completeUpload` | `media.id`, `media.mime_type`, `media.size_bytes` |
| 🆕 | P1 | `media.presigned.object_missing` | warn | `completeUpload` (400) | `media.id` |
| 🆕 | P2 | `media.deleted` | info | `MediaService.deleteMedia` | `media.id`, `media.size_bytes` |
| ✅ | P0 | `storage.delete.failed` | warn | `StorageService.del` (mọi chỗ xoá) | `storage.reason` (`provider_error` \| `unknown_provider`), `storage.provider`, `error.*` — không ghi URL |
| ✅ | P0 | `storage.provider.fallback` | warn | `StorageService` khởi tạo | `storage.requested`, `storage.active`, `storage.reason` |
| 🆕 | P1 | `avatar.uploaded` / `avatar.upload_failed` | info/error | `TasksService.handleAvatarUpload`, `AuthService.storeClaimAvatar` | `member.id` hoặc `user.id`, `error.*` |

### 3.4 Liên hệ, thư, thông báo (`contact`, `mail`, `notification`)

| | Ưu tiên | `event.name` | Mức | Nơi | Thuộc tính |
| --- | --- | --- | --- | --- | --- |
| 🆕 | P1 | `contact.message.received` | info | `ContactService` tạo thư | `contact.reference`, `contact.attachments`, `contact.category` — **không** nội dung/email người gửi |
| ✅ | P0 | `contact.rate_limited` | warn | `ContactRateLimiter` | `rate_limit.scope`, `rate_limit.window_s`, `rate_limit.max` |
| ✅ | P0 | `contact.attachment.upload_failed` | error | `ContactService` | `contact.attachment.mime_type`, `contact.attachment.bytes`, `contact.attachments_uploaded`, `error.*` |
| 🆕 | P2 | `contact.reference.collision` | warn | sinh mã tham chiếu | `contact.attempt` |
| 🆕 | P1 | `mail.sent` | info | `MailService.send` | `mail.template`, `mail.recipients` (số lượng) |
| ✅ | P0 | `mail.send_failed` | error | `MailService.send` | `mail.provider`, `mail.recipients` (số lượng), `http.response.status_code`, `error.*` — không subject/địa chỉ |
| 🆕 | P1 | `notification.unsubscribed` | info | `NotificationsController.unsubscribe` | `user.id`, `notification.channel`; token sai → `notification.unsubscribe_invalid` (warn) |

### 3.5 Xuất dữ liệu (`export`)

| | Ưu tiên | `event.name` | Mức | Nơi | Thuộc tính |
| --- | --- | --- | --- | --- | --- |
| 🆕 | P1 | `export.generated` | info | `ExportService.gedcom` / `book` | `export.format`, `export.members`, `export.bytes`, `export.duration_ms`, `export.scoped` (có `rootId`) |

Xuất toàn bộ gia phả là thao tác dữ liệu nhạy cảm — log giữ dấu vết ai xuất (`user.id`).

### 3.6 Hạ tầng (`cache`, `config`)

| | Ưu tiên | `event.name` | Mức | Nơi | Thuộc tính |
| --- | --- | --- | --- | --- | --- |
| ✅ | P0 | `cache.degraded` | warn (**throttled**) | `SafeCache`, `setMediaProgress`, hai rate limiter "cho qua" | `cache.component`, `cache.operation`, `error.*`, `throttle.suppressed` |
| ✅ | P0 | `config.missing` | error | `MailService.onModuleInit` (một lần lúc khởi động) | `config.component`, `config.keys` — chỉ tên biến, không giá trị |

### 3.7 Cố ý KHÔNG log

- CRUD member / relationship / grave / event / article / memory — audit DB hoặc không cần vận hành.
- Đọc (GET), lượt xem (`/view`), thắp hương / tri ân — là số liệu sản phẩm, không phải vận hành.
- 401 do JWT hết hạn — bình thường, quá ồn (dùng `debug` nếu cần điều tra tạm).
- 4xx do validate DTO — traces đã có status code.

## 4. Lượng log & ngưỡng

Ước tính quy mô hiện tại (gia phả một dòng họ, vài chục người dùng hoạt động):
vài trăm log/ngày, chủ yếu `info` từ `queue.task.completed`, `media.*`, `mail.sent`.
Rủi ro lụt duy nhất là `cache.degraded` khi Upstash sập → đã throttle.
Nếu cần giảm: `SENTRY_LOG_LEVEL=warn` bỏ toàn bộ `info`, giữ mọi tín hiệu P0.

## 5. Alert đề xuất (Sentry → Alerts trên Logs)

| Điều kiện | Lý do |
| --- | --- |
| `event.name:auth.login.failed` > 20 / 10 phút | dò mật khẩu |
| `event.name:queue.signature.invalid` ≥ 1 | ai đó gọi thẳng callback |
| `event.name:admin.user.roles_changed` ≥ 1 | thông báo mỗi lần cấp quyền |
| `event.name:reminder.run.completed reminder.failed:>0` | email nhắc ngày giỗ lỗi |
| `severity:error` theo `event.name`, ≥ 1 | lỗi đã xử lý (mail, storage, publish, config) |
| `event.name:cache.degraded` ≥ 1 / 15 phút | Redis có vấn đề |

## 6. Thứ tự triển khai

1. ✅ Helper `logEvent` / `logEventThrottled` + scope `user.id` trong `JwtStrategy`; đổi 7 log hiện có sang có `event.name`.
2. ✅ P0 — bảo mật, lỗi đã xử lý, suy giảm hạ tầng.
3. P1 — thao tác quản trị, tóm tắt job, media/contact/mail/export.
4. P2 + tạo alert ở mục 5.
