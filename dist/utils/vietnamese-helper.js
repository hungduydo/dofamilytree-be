"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeVietnameseTones = void 0;
function removeVietnameseTones(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}
exports.removeVietnameseTones = removeVietnameseTones;
//# sourceMappingURL=vietnamese-helper.js.map