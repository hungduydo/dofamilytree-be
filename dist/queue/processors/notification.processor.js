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
var NotificationProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const queue_constants_1 = require("../queue.constants");
let NotificationProcessor = NotificationProcessor_1 = class NotificationProcessor {
    constructor() {
        this.logger = new common_1.Logger(NotificationProcessor_1.name);
    }
    async handleNotification(job) {
        const { type, payload } = job.data;
        this.logger.log(`[Notification] type=${type} payload=${JSON.stringify(payload)}`);
        switch (type) {
            case 'NEW_MEMBER':
                this.logger.log(`New member added: ${payload.name}`);
                break;
            case 'NEW_RELATIONSHIP':
                this.logger.log(`New relationship: ${payload.parentId} → ${payload.childId} (${payload.type})`);
                break;
            case 'NEW_EVENT':
                this.logger.log(`New event: ${payload.title}`);
                break;
        }
    }
};
exports.NotificationProcessor = NotificationProcessor;
__decorate([
    (0, bull_1.Process)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationProcessor.prototype, "handleNotification", null);
exports.NotificationProcessor = NotificationProcessor = NotificationProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUE_NOTIFICATION)
], NotificationProcessor);
//# sourceMappingURL=notification.processor.js.map