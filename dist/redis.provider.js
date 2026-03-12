"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisProvider = void 0;
const redis_1 = require("@upstash/redis");
exports.redisProvider = {
    provide: 'REDIS_CLIENT',
    useFactory: () => {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        if (!url || !token) {
            throw new Error('UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not defined');
        }
        return new redis_1.Redis({
            url,
            token,
        });
    },
};
//# sourceMappingURL=redis.provider.js.map