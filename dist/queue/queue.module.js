"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const avatar_upload_processor_1 = require("./processors/avatar-upload.processor");
const report_generate_processor_1 = require("./processors/report-generate.processor");
const notification_processor_1 = require("./processors/notification.processor");
const queue_constants_1 = require("./queue.constants");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.registerQueue({ name: queue_constants_1.QUEUE_AVATAR_UPLOAD }, { name: queue_constants_1.QUEUE_REPORT_GENERATE }, { name: queue_constants_1.QUEUE_NOTIFICATION }, { name: queue_constants_1.QUEUE_IMAGE_PROCESS }),
        ],
        providers: [avatar_upload_processor_1.AvatarUploadProcessor, report_generate_processor_1.ReportGenerateProcessor, notification_processor_1.NotificationProcessor],
        exports: [bull_1.BullModule],
    })
], QueueModule);
//# sourceMappingURL=queue.module.js.map