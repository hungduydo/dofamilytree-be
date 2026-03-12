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
var ReportGenerateProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportGenerateProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const queue_constants_1 = require("../queue.constants");
let ReportGenerateProcessor = ReportGenerateProcessor_1 = class ReportGenerateProcessor {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ReportGenerateProcessor_1.name);
    }
    async handleReportGenerate(job) {
        this.logger.log('Generating family tree report...');
        try {
            const [totalMembers, maxGenProfile, deceasedCount] = await Promise.all([
                this.prisma.member.count(),
                this.prisma.profile.aggregate({ _max: { generation: true } }),
                this.prisma.member.count({ where: { deathDate: { not: null } } }),
            ]);
            const report = {
                totalMembers,
                totalGenerations: maxGenProfile._max.generation || 0,
                deceased: deceasedCount,
                generatedAt: new Date().toISOString(),
            };
            this.logger.log(`Report generated: ${totalMembers} members`);
            return report;
        }
        catch (error) {
            this.logger.error('Failed to generate report', error);
            throw error;
        }
    }
};
exports.ReportGenerateProcessor = ReportGenerateProcessor;
__decorate([
    (0, bull_1.Process)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ReportGenerateProcessor.prototype, "handleReportGenerate", null);
exports.ReportGenerateProcessor = ReportGenerateProcessor = ReportGenerateProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUE_REPORT_GENERATE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReportGenerateProcessor);
//# sourceMappingURL=report-generate.processor.js.map