"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const members_module_1 = require("./members/members.module");
const relationships_module_1 = require("./relationships/relationships.module");
const tree_module_1 = require("./tree/tree.module");
const events_module_1 = require("./events/events.module");
const media_module_1 = require("./media/media.module");
const graves_module_1 = require("./graves/graves.module");
const queue_module_1 = require("./queue/queue.module");
const redis_module_1 = require("./redis.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            redis_module_1.RedisModule,
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            queue_module_1.QueueModule,
            members_module_1.MembersModule,
            relationships_module_1.RelationshipsModule,
            tree_module_1.TreeModule,
            events_module_1.EventsModule,
            media_module_1.MediaModule,
            graves_module_1.GravesModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map