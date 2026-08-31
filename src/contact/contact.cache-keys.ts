/**
 * Khoá cache cho `GET /v2/contact/info`. Tách file riêng theo đúng tiền lệ
 * tree.cache-keys.ts / members.cache-keys.ts / memorial.cache-keys.ts: nơi khác
 * muốn invalidate không phải import cả ContactModule chỉ vì mấy chuỗi hằng.
 */

/**
 * HAI khoá, không phải một — và đây là điểm dễ sai NHẤT của module này.
 *
 * Response chứa `board[].phone` / `.email`, là PII bị null hoá cho người gọi
 * không đủ quyền. Cache chung MỘT khoá cho cả hai nhóm nghĩa là: một `member`
 * gọi trước sẽ nhồi bản CÓ số điện thoại vào cache, và mọi `editor` / khách vãng
 * lai gọi sau đều đọc được số điện thoại đó. Đó là RÒ RỈ PII, không phải lỗi
 * cache thường.
 */
export const contactInfoKey = (canSeePii: boolean) => `contact:info:${canSeePii ? 'pii' : 'public'}`;

/** Cả hai biến thể — xoá sau mỗi lần sửa thông tin liên hệ. */
export const CONTACT_INFO_CACHE_KEYS: string[] = [contactInfoKey(true), contactInfoKey(false)];

/**
 * TTL 1 giờ. Thông tin liên hệ của một dòng họ đổi vài lần mỗi THẬP KỶ, và FE
 * cũng giữ đúng 1 giờ (api-contact.md §3.1) — để hai bên lệch nhau chỉ tạo ra
 * khoảng thời gian FE hiện dữ liệu cũ hơn cả API.
 *
 * Ban liên lạc (`board`) đổi thường hơn khối còn lại vì nó chiếu từ `members`:
 * admin sửa profile.isCommittee thì thẻ ban liên lạc trễ tối đa 1 giờ. Chấp
 * nhận được — đây không phải dữ liệu người dùng nhìn thấy thay đổi tức thì.
 */
export const CONTACT_CACHE_TTL = 60 * 60;
