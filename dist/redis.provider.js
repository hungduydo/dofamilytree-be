"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisProvider = void 0;
const ioredis_1 = require("ioredis");
exports.redisProvider = {
    provide: 'REDIS_CLIENT',
    useFactory: () => {
        if (process.env.REDIS_URL) {
            return new ioredis_1.default(process.env.REDIS_URL);
        }
        return new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
        });
    },
};
//# sourceMappingURL=redis.provider.js.map