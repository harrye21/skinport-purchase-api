import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

const baseEnv = {
  PORT: '3100',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/skinport',
  REDIS_URL: 'redis://localhost:6379',
  SKINPORT_API_URL: 'https://api.skinport.com/v1/items',
  SKINPORT_USER_AGENT: 'test-agent',
  USE_SKINPORT_FALLBACK: 'true',
  ITEM_CACHE_TTL: '60',
  USER_API_KEYS: 'test-token:1'
};

let redisMock: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } | null = null;

vi.mock('../src/redisClient.js', () => ({
  getRedisClient: async () => {
    if (!redisMock) {
      throw new Error('redis mock not initialised');
    }
    return redisMock;
  },
  closeRedisClient: vi.fn()
}));

vi.mock('../src/db.js', () => ({
  getDbClient: () => {
    throw new Error('db client should not be used in item route tests');
  },
  closeDbClient: vi.fn()
}));

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
  redisMock = null;
});

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv, ...baseEnv, NODE_ENV: 'test' };
});

describe('GET /items', () => {
  it('returns cached items when present in Redis', async () => {
    const cachedItems = [
      { marketHashName: 'AK-47 | Redline (Field-Tested)', tradableMinPrice: 12.34, nonTradableMinPrice: 10.5 },
      { marketHashName: 'Desert Eagle | Bronze Deco (Factory New)', tradableMinPrice: 1.25, nonTradableMinPrice: null }
    ];

    redisMock = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cachedItems)),
      set: vi.fn()
    };

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { registerItemRoutes } = await import('../src/routes/items.js');
    const server = Fastify();
    await server.register(registerItemRoutes);

    const response = await server.inject({ method: 'GET', url: '/items' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(cachedItems);
    expect(redisMock?.get).toHaveBeenCalledWith('items:min-prices');
    expect(fetchSpy).not.toHaveBeenCalled();

    await server.close();
  });

  it('falls back to bundled sample data when Skinport fetch fails', async () => {
    redisMock = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn()
    };

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { registerItemRoutes } = await import('../src/routes/items.js');
    const server = Fastify();
    await server.register(registerItemRoutes);

    const response = await server.inject({ method: 'GET', url: '/items' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toContainEqual({
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      tradableMinPrice: 12.34,
      nonTradableMinPrice: 10.5
    });
    expect(body).toContainEqual({
      marketHashName: 'AWP | Sun in Leo (Minimal Wear)',
      tradableMinPrice: 3.75,
      nonTradableMinPrice: 4.1
    });
    expect(redisMock?.set).toHaveBeenCalled();

    await server.close();
  });
});
