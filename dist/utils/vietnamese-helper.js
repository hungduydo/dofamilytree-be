"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeVietnameseTones = removeVietnameseTones;
function removeVietnameseTones(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}
//# sourceMappingURL=vietnamese-helper.js.map