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
exports.RelationshipsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_guard_1 = require("../auth/jwt.guard");
const relationships_service_1 = require("./relationships.service");
const create_relationship_dto_1 = require("./dto/create-relationship.dto");
let RelationshipsController = class RelationshipsController {
    constructor(relationshipsService) {
        this.relationshipsService = relationshipsService;
    }
    getRelationships(id) {
        return this.relationshipsService.getRelationships(id);
    }
    getParents(id) {
        return this.relationshipsService.getParents(id);
    }
    getChildren(id) {
        return this.relationshipsService.getChildren(id);
    }
    getSpouses(id) {
        return this.relationshipsService.getSpouses(id);
    }
    getAncestors(id) {
        return this.relationshipsService.getAncestors(id);
    }
    getDescendants(id) {
        return this.relationshipsService.getDescendants(id);
    }
    searchRelationships(query) {
        return this.relationshipsService.searchRelationships(query);
    }
    addRelationship(dto) {
        return this.relationshipsService.addRelationship(dto);
    }
    deleteRelationship(id) {
        return this.relationshipsService.deleteRelationship(id);
    }
};
exports.RelationshipsController = RelationshipsController;
__decorate([
    (0, common_1.Get)('members/:id/relationships'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all relationships for a member' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "getRelationships", null);
__decorate([
    (0, common_1.Get)('members/:id/relationships/parents'),
    (0, swagger_1.ApiOperation)({ summary: 'Get parents of a member' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "getParents", null);
__decorate([
    (0, common_1.Get)('members/:id/relationships/children'),
    (0, swagger_1.ApiOperation)({ summary: 'Get children of a member' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "getChildren", null);
__decorate([
    (0, common_1.Get)('members/:id/relationships/spouses'),
    (0, swagger_1.ApiOperation)({ summary: 'Get spouses of a member' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "getSpouses", null);
__decorate([
    (0, common_1.Get)('members/:id/relationships/ancestors'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all ancestors (recursive)' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "getAncestors", null);
__decorate([
    (0, common_1.Get)('members/:id/relationships/descendants'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all descendants (recursive)' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "getDescendants", null);
__decorate([
    (0, common_1.Get)('relationships/search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search relationships by type, memberId, role' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_relationship_dto_1.SearchRelationshipDto]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "searchRelationships", null);
__decorate([
    (0, common_1.Post)('members/:memberId/relationships'),
    (0, swagger_1.ApiOperation)({ summary: 'Add relationship between two members' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_relationship_dto_1.CreateRelationshipDto]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "addRelationship", null);
__decorate([
    (0, common_1.Delete)('relationships/:id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a relationship' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelationshipsController.prototype, "deleteRelationship", null);
exports.RelationshipsController = RelationshipsController = __decorate([
    (0, swagger_1.ApiTags)('Relationships'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [relationships_service_1.RelationshipsService])
], RelationshipsController);
//# sourceMappingURL=relationships.controller.js.map