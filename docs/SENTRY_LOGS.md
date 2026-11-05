# Sentry Logs

Log có cấu trúc gửi lên **Sentry → Explore → Logs**, tự gắn `trace_id` của
request/job đang chạy (bấm từ log sang trace và ngược lại).

## Cấu hình

| Biến | Ý nghĩa |
| --- | --- |
| `SENTRY_DSN` | Trống ⇒ tắt hẳn Sentry (mọi `Sentry.logger.*` là no-op). |
| `SENTRY_LOG_LEVEL` | Ngưỡng gửi: `trace` `debug` `info` `warn` `error` `fatal` `off`. Mặc định `info`. |

SDK v11 không còn cờ `enableLogs` — log luôn bật khi có DSN; ngưỡng và lọc dữ
liệu nhạy cảm nằm ở `scrubLog` (`beforeSendLog`) trong `src/instrument.ts`.
Trên Vercel, `src/vercel.ts` flush ngay sau request có log để function không bị
đóng băng khi log còn trong buffer.

`Logger` của Nest **không** được nối sang Sentry (không dùng
`consoleLoggingIntegration`): nhiều dòng cũ nội suy email, URL có token vào
message. Nest logger vẫn là log console/Vercel; `Sentry.logger` chỉ dùng cho
những sự kiện đáng tra cứu.

## Dùng `logEvent`, không gọi `Sentry.logger` trực tiếp

```ts
import { errorAttributes, logEvent, logEventThrottled } from '../observability/log-event';

logEvent('auth.login.failed', 'warn', 'Login failed', { 'auth.reason': 'deactivated' });
logEvent('mail.send_failed', 'error', 'Mail send failed', { 'mail.recipients': 2, ...errorAttributes(err) });
// Sự kiện có thể lặp theo từng request khi hạ tầng hỏng: tối đa 1 log / phút / khoá.
logEventThrottled('cache.degraded', 'warn', 'Cache degraded, falling back', attrs, 'TreeService:get');
```

- `event.name` lấy từ union `LogEventName` — tên sai là lỗi biên dịch. Danh mục đầy
  đủ và lý do từng sự kiện: `docs/SENTRY_LOG_EVENTS.md`.
- `user.id` / `user.roles` của người gọi đã được `JwtStrategy` gắn sẵn lên scope
  request — không truyền lại; đối tượng bị tác động dùng `target.user.id`.

## Quy tắc viết log

1. **Message cố định, chi tiết ở thuộc tính.** Message giống nhau ⇒ gom nhóm,
   đếm, alert được. Cần chèn giá trị vào câu thì dùng `Sentry.logger.fmt` —
   template giữ nguyên, tham số thành thuộc tính `sentry.message.parameter.N`.

   ```ts
   // ✗ mỗi media một message khác nhau, không lọc theo id được
   Sentry.logger.info(`Media ${mediaId} processed`);

   // ✓
   Sentry.logger.info('Media processed', { 'media.id': mediaId, 'media.duration_ms': ms });
   Sentry.logger.warn(Sentry.logger.fmt`Unknown QStash task ${task}`, { 'messaging.system': 'qstash' });
   ```

2. **Đặt tên thuộc tính theo namespace**: dùng khoá semantic conventions khi có
   (`user.id`, `error.type`, `messaging.system`, `url.full`…), còn lại
   `<miền>.<trường>` dạng snake_case (`reminder.sent`, `media.input_bytes`).

3. **Không PII.** Không đưa email, mật khẩu, token, IP, URL có query vào message
   hay thuộc tính. Dùng id nội bộ (`user.id` là UUID). `scrubLog` là lớp chặn
   thứ hai (che khoá `*email*`, `*token*`, `*ip*`…, cắt query URL, che email
   trong chuỗi) — **message không được scrub**.

4. **Chọn mức đúng**

   | Mức | Khi nào |
   | --- | --- |
   | `debug` / `trace` | Chẩn đoán tạm thời; bị lọc ở mặc định `info`. |
   | `info` | Kết quả một đơn vị công việc (job chạy xong, media xử lý xong). |
   | `warn` | Đường suy giảm nhưng vẫn phục vụ được (bỏ qua, fallback). |
   | `error` | Thao tác thất bại đã được xử lý / không ném ra (lỗi cấu hình, một email lỗi). |
   | `fatal` | Process không thể tiếp tục. |

5. **Log hay exception?** Lỗi bất ngờ cứ để ném — `SentryGlobalFilter` biến nó
   thành issue. Lỗi *đã xử lý* (catch rồi tiếp tục) thì dùng `Sentry.logger.error`
   — không `captureException` cho từng lần, tránh tạo issue ồn.

6. **Một log tóm tắt mỗi job** (wide event) tốt hơn một dòng mỗi bước — xem
   `AnniversaryReminderService.sendDailyReminders`.

## Ví dụ trong code

- `src/notifications/anniversary-reminder.service.ts` — log tóm tắt job bằng
  `fmt` + bộ đếm; `warn` khi bỏ qua; `error` cho lỗi cấu hình và email lỗi đã xử lý.
- `src/queue/tasks.service.ts` (`handleMediaProcess`) — `info` kèm số đo
  (byte vào/ra, thời gian), `error` khi thất bại.
- `src/queue/queue.controller.ts` — `warn` task QStash không rõ, khoá `messaging.*`.

## Truy vấn gợi ý (Logs UI)

- `reminder.failed:>0` — lần chạy nhắc ngày giỗ có email lỗi.
- `message:"Media processed"` → vẽ `avg(media.duration_ms)`.
- `severity:error` nhóm theo `message` — các lỗi đã xử lý nhiều nhất.
