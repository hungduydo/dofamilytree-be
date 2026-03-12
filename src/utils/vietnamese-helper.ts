/**
 * Remove Vietnamese diacritical marks for accent-insensitive search.
 * Reused from backend/src/utils/vietnameseHelper.ts
 */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
