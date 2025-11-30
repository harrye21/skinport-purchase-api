import { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { getRedisClient } from '../redisClient.js';

interface SkinportItem {
  market_hash_name: string;
  min_price: number;
  tradable: boolean;
}

export interface ItemPriceSummary {
  marketHashName: string;
  tradableMinPrice: number | null;
  nonTradableMinPrice: number | null;
}

const ITEMS_CACHE_KEY = 'items:min-prices';

const aggregatePrices = (items: SkinportItem[]): ItemPriceSummary[] => {
  const map = new Map<string, ItemPriceSummary>();

  for (const item of items) {
    const existing = map.get(item.market_hash_name) ?? {
      marketHashName: item.market_hash_name,
      tradableMinPrice: null,
      nonTradableMinPrice: null
    };

    if (item.tradable) {
      if (existing.tradableMinPrice === null || item.min_price < existing.tradableMinPrice) {
        existing.tradableMinPrice = item.min_price;
      }
    } else {
      if (existing.nonTradableMinPrice === null || item.min_price < existing.nonTradableMinPrice) {
        existing.nonTradableMinPrice = item.min_price;
      }
    }

    map.set(item.market_hash_name, existing);
  }

  return Array.from(map.values());
};

const fetchItemPrices = async (): Promise<ItemPriceSummary[]> => {
  const url = `${env.skinportApiUrl}?app_id=730&currency=EUR`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Skinport API responded with ${response.status}`);
  }

  const payload = (await response.json()) as SkinportItem[];
  return aggregatePrices(payload);
};

export const registerItemRoutes = async (fastify: FastifyInstance): Promise<void> => {
  const redis = getRedisClient();

  fastify.get('/items', async (request, reply) => {
    try {
      const cached = await redis.get(ITEMS_CACHE_KEY);

      if (cached) {
        return JSON.parse(cached) as ItemPriceSummary[];
      }

      const items = await fetchItemPrices();
      await redis.set(ITEMS_CACHE_KEY, JSON.stringify(items), {
        EX: env.cacheTtlSeconds
      });

      return items;
    } catch (error) {
      fastify.log.error(error);
      reply.status(500);
      return { error: 'Unable to fetch item prices' };
    }
  });
};
