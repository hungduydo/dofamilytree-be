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
exports.TreeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_guard_1 = require("../auth/jwt.guard");
const tree_service_1 = require("./tree.service");
class CreateTreeDto {
}
class UpdateTreeDto {
}
let TreeController = class TreeController {
    constructor(treeService) {
        this.treeService = treeService;
    }
    getChart() {
        return this.treeService.getFamilyTreeChart();
    }
    getSubTreeChart(memberId) {
        return this.treeService.getFamilySubTreeChart(memberId);
    }
    regenerate() {
        return this.treeService.regenerateFamilyTreeChart();
    }
    getStats() {
        return this.treeService.getStats();
    }
    getHomeTrees() {
        return this.treeService.getHomeTrees();
    }
    getAllTrees() {
        return this.treeService.getAllTrees();
    }
    getTreeById(id) {
        return this.treeService.getTreeById(id);
    }
    createTree(dto) {
        return this.treeService.createTree(dto);
    }
    updateTree(id, dto) {
        return this.treeService.updateTree(id, dto);
    }
    deleteTree(id) {
        return this.treeService.deleteTree(id);
    }
};
exports.TreeController = TreeController;
__decorate([
    (0, common_1.Get)('chart'),
    (0, swagger_1.ApiOperation)({ summary: 'Get full family tree chart (Redis cached, 1h TTL)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "getChart", null);
__decorate([
    (0, common_1.Get)('chart/:memberId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get 4-generation subtree from member' }),
    __param(0, (0, common_1.Param)('memberId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "getSubTreeChart", null);
__decorate([
    (0, common_1.Post)('regenerate'),
    (0, swagger_1.ApiOperation)({ summary: 'Force regenerate tree chart + invalidate Redis cache' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "regenerate", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get tree statistics + cache status' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('home'),
    (0, swagger_1.ApiOperation)({ summary: 'Get trees with show=true (for homepage)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "getHomeTrees", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all tree records' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "getAllTrees", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get tree by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "getTreeById", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create new tree record (branch)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateTreeDto]),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "createTree", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update tree record' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateTreeDto]),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "updateTree", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete tree record' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TreeController.prototype, "deleteTree", null);
exports.TreeController = TreeController = __decorate([
    (0, swagger_1.ApiTags)('Tree'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('tree'),
    __metadata("design:paramtypes", [tree_service_1.TreeService])
], TreeController);
//# sourceMappingURL=tree.controller.js.map