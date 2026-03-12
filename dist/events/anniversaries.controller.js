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
exports.AnniversariesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_guard_1 = require("../auth/jwt.guard");
const events_service_1 = require("./events.service");
const create_event_dto_1 = require("./dto/create-event.dto");
let AnniversariesController = class AnniversariesController {
    constructor(eventsService) {
        this.eventsService = eventsService;
    }
    getAnniversaries(member_id, month) {
        return this.eventsService.getAnniversaries({ member_id, month: month ? +month : undefined });
    }
    getUpcoming() {
        return this.eventsService.getUpcomingAnniversaries();
    }
    getById(id) {
        return this.eventsService.getAnniversaryById(id);
    }
    create(dto) {
        return this.eventsService.createAnniversary(dto);
    }
    update(id, dto) {
        return this.eventsService.updateAnniversary(id, dto);
    }
    delete(id) {
        return this.eventsService.deleteAnniversary(id);
    }
};
exports.AnniversariesController = AnniversariesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get anniversaries (filter by member_id, month)' }),
    (0, swagger_1.ApiQuery)({ name: 'member_id', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'month', required: false, type: Number }),
    __param(0, (0, common_1.Query)('member_id')),
    __param(1, (0, common_1.Query)('month')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", void 0)
], AnniversariesController.prototype, "getAnniversaries", null);
__decorate([
    (0, common_1.Get)('upcoming'),
    (0, swagger_1.ApiOperation)({ summary: 'Get upcoming anniversaries (next 30 days)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnniversariesController.prototype, "getUpcoming", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get anniversary by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AnniversariesController.prototype, "getById", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create anniversary (optional member link)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_event_dto_1.CreateAnniversaryDto]),
    __metadata("design:returntype", void 0)
], AnniversariesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update anniversary' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_event_dto_1.UpdateAnniversaryDto]),
    __metadata("design:returntype", void 0)
], AnniversariesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete anniversary' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AnniversariesController.prototype, "delete", null);
exports.AnniversariesController = AnniversariesController = __decorate([
    (0, swagger_1.ApiTags)('Anniversaries (Ngày giỗ)'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('anniversaries'),
    __metadata("design:paramtypes", [events_service_1.EventsService])
], AnniversariesController);
//# sourceMappingURL=anniversaries.controller.js.map