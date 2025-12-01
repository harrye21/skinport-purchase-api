import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const originalEnv = { ...process.env };
const baseEnv = {
    PORT: '3200',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/skinport',
    REDIS_URL: 'redis://localhost:6379',
    SKINPORT_API_URL: 'https://api.skinport.com/v1/items',
    SKINPORT_USER_AGENT: 'test-agent',
    USE_SKINPORT_FALLBACK: 'true',
    ITEM_CACHE_TTL: '60',
    USER_API_KEYS: 'test-token:1'
};
let dbMock = null;
let redisMock = null;
vi.mock('../src/db.js', () => ({
    getDbClient: () => {
        if (!dbMock) {
            throw new Error('db mock not initialised');
        }
        return dbMock.client;
    },
    closeDbClient: vi.fn()
}));
vi.mock('../src/redisClient.js', () => ({
    getRedisClient: async () => {
        if (!redisMock) {
            redisMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
        }
        return redisMock;
    },
    closeRedisClient: vi.fn()
}));
afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    dbMock = null;
    redisMock = null;
});
beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...baseEnv, NODE_ENV: 'test' };
});
const createDbMock = ({ startingBalance, price }) => {
    const state = { balance: startingBalance };
    const tx = vi.fn(async (strings) => {
        const query = strings.join(' ').toLowerCase();
        if (query.includes('from users')) {
            return [{ id: 1, balance: state.balance }];
        }
        if (query.includes('from products')) {
            return [{ id: 5, price, name: 'Test Product' }];
        }
        if (query.includes('update users set balance')) {
            state.balance -= price;
            return [{ id: 1, balance: state.balance }];
        }
        if (query.includes('insert into purchases')) {
            return [];
        }
        throw new Error(`Unexpected query: ${query}`);
    });
    return {
        client: {
            begin: vi.fn(async (callback) => callback(tx))
        },
        tx
    };
};
describe('POST /purchase', () => {
    it('processes a purchase and returns the updated balance', async () => {
        dbMock = createDbMock({ startingBalance: 100.75, price: 25.5 });
        const { buildServer } = await import('../src/index.js');
        const server = buildServer();
        const response = await server.inject({
            method: 'POST',
            url: '/purchase',
            headers: {
                authorization: 'Bearer test-token'
            },
            payload: { productId: 5 }
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ userId: 1, balance: 75.25 });
        expect(dbMock?.tx).toHaveBeenCalled();
        await server.close();
    });
    it('rejects purchases that exceed the available balance', async () => {
        dbMock = createDbMock({ startingBalance: 5, price: 25.5 });
        const { buildServer } = await import('../src/index.js');
        const server = buildServer();
        const response = await server.inject({
            method: 'POST',
            url: '/purchase',
            headers: {
                authorization: 'Bearer test-token'
            },
            payload: { productId: 5 }
        });
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({ error: 'Insufficient balance' });
        await server.close();
    });
});
