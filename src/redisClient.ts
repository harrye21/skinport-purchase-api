import { createClient, RedisClientType } from 'redis';
import { env } from './env.js';

let client: RedisClientType | null = null;

export const getRedisClient = (): RedisClientType => {
  if (client) {
    return client;
  }

  client = createClient({ url: env.redisUrl });

  client.on('error', (error) => {
    console.error('Redis client error:', error);
  });

  client.connect().catch((error) => {
    console.error('Failed to connect to Redis:', error);
  });

  return client;
};
