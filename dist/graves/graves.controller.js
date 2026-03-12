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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GravesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_guard_1 = require("../auth/jwt.guard");
const graves_service_1 = require("./graves.service");
const create_grave_dto_1 = require("./dto/create-grave.dto");
let GravesController = class GravesController {
    constructor(gravesService) {
        this.gravesService = gravesService;
    }
    getAllGraves(name) {
        return this.gravesService.getAllGraves({ name });
    }
    getNearbyGraves(lat, lng, radiusKm) {
        return this.gravesService.getNearbyGraves({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            radiusKm: radiusKm ? parseFloat(radiusKm) : 10,
        });
    }
    getGraveById(id) {
        return this.gravesService.getGraveById(id);
    }
    createGrave(dto) {
        return this.gravesService.createGrave(dto);
    }
    updateGrave(id, dto) {
        return this.gravesService.updateGrave(id, dto);
    }
    deleteGrave(id) {
        return this.gravesService.deleteGrave(id);
    }
};
exports.GravesController = GravesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all graves (filter by name)' }),
    (0, swagger_1.ApiQuery)({ name: 'name', required: false }),
    __param(0, (0, common_1.Query)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GravesController.prototype, "getAllGraves", null);
__decorate([
    (0, common_1.Get)('nearby'),
    (0, swagger_1.ApiOperation)({ summary: 'Find graves near coordinates (lat, lng, radiusKm)' }),
    (0, swagger_1.ApiQuery)({ name: 'lat', required: true, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'lng', required: true, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'radiusKm', required: false, type: Number }),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('radiusKm')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], GravesController.prototype, "getNearbyGraves", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get grave by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GravesController.prototype, "getGraveById", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create new grave with GPS coordinates' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_grave_dto_1.CreateGraveDto]),
    __metadata("design:returntype", void 0)
], GravesController.prototype, "createGrave", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update grave info + coordinates' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_grave_dto_1.UpdateGraveDto]),
    __metadata("design:returntype", void 0)
], GravesController.prototype, "updateGrave", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete grave' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GravesController.prototype, "deleteGrave", null);
exports.GravesController = GravesController = __decorate([
    (0, swagger_1.ApiTags)('Graves (Mộ phần)'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('graves'),
    __metadata("design:paramtypes", [graves_service_1.GravesService])
], GravesController);
//# sourceMappingURL=graves.controller.js.map