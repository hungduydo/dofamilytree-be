"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NearbyGraveQueryDto = exports.UpdateGraveDto = exports.CreateGraveDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateGraveDto {
}
exports.CreateGraveDto = CreateGraveDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Mộ Nguyễn Văn A' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateGraveDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10.7769 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateGraveDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 106.7009 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateGraveDto.prototype, "longitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Nghĩa trang Bình Hưng Hòa' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGraveDto.prototype, "description", void 0);
class UpdateGraveDto {
}
exports.UpdateGraveDto = UpdateGraveDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateGraveDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateGraveDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateGraveDto.prototype, "longitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateGraveDto.prototype, "description", void 0);
class NearbyGraveQueryDto {
}
exports.NearbyGraveQueryDto = NearbyGraveQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10.7769 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], NearbyGraveQueryDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 106.7009 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], NearbyGraveQueryDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 10, description: 'Radius in km (default: 10)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], NearbyGraveQueryDto.prototype, "radiusKm", void 0);
//# sourceMappingURL=create-grave.dto.js.map