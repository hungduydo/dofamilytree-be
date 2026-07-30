# Refactor & Improvement Tasks

Danh sách task được rút ra từ phân tích cấu trúc project (backend Express + Prisma, frontend Next.js 15).
Mỗi file là một task độc lập, self-contained, có thể giao cho một agent implement riêng.

## Cách dùng
- Mỗi task có: **Context** (tại sao), **Scope** (làm gì), **Files**, **Acceptance criteria**, **Out of scope**.
- Ưu tiên làm theo thứ tự P0 → P1 → P2. Các task cùng priority phần lớn độc lập nhau.
- Sau mỗi task: chạy `pnpm test` ở package tương ứng và đảm bảo build pass.

## Tổng quan mức độ ưu tiên

| # | Task | Priority | Area | Est |
|---|------|----------|------|-----|
| 01 | Thêm database indexes vào Prisma schema | P0 | Backend/DB | S |
| 02 | Fix N+1 query trong `getAllMembers` | P0 | Backend | S |
| 03 | Family tree cache invalidation khi mutate | P0 | Backend | M |
| 04 | Bỏ hardcoded `JWT_SECRET` fallback + fail-fast env | P0 | Security | S |
| 05 | Centralized error handler + chuẩn hoá API response | P1 | Backend | M |
| 06 | Bỏ side-effect write trong GET (`getMemberProfileById`) | P1 | Backend | S |
| 07 | Input validation (zod) cho controllers | P1 | Backend | M |
| 08 | Security middleware: helmet + rate limit + CORS whitelist | P1 | Security | S |
| 09 | Hợp nhất 2 model relationship (v1 `Relationship` vs v2 `MemberRelationship`) | P1 | Architecture | L |
| 10 | Gỡ duplicate `verifyToken` trong `auth.controller` | P2 | Backend | S |
| 11 | Bỏ `any`, thêm domain types/DTO cho services | P2 | Types | M |
| 12 | Migrate `birthDate`/`deathDate` từ String → DateTime | P2 | Backend/DB | M |
| 13 | Dọn logging (node:console, log toàn bộ member IDs) | P2 | Backend | S |
| 14 | Tách các component frontend quá lớn | P2 | Frontend | M |

S = <2h, M = nửa ngày, L = 1+ ngày
