# Skinport Purchase API

[Русская версия](./README.ru.md)

A compact Fastify service written in strict TypeScript with two core endpoints:

- **GET `/items`** — Fetches Skinport items with default `app_id`/`currency`, returns the minimal tradable and non-tradable prices per item, and caches the response in Redis.
- **POST `/purchase`** — Processes a transactional purchase from the local database, records it, and returns the updated user balance.

## Requirements

- Node.js 20+
- PostgreSQL
- Redis

## Quick start (PowerShell)

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Configure the environment (defaults support local demos):

   ```powershell
   Copy-Item .env.example .env
   @'
   PORT=3000
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/skinport
   REDIS_URL=redis://localhost:6379
   SKINPORT_API_URL=https://api.skinport.com/v1/items
   SKINPORT_USER_AGENT=skinport-purchase-api/1.0 (+https://github.com/user/skinport-purchase-api)
   USE_SKINPORT_FALLBACK=true
   ITEM_CACHE_TTL=300
   USER_API_KEYS=
   '@ | Set-Content .env
   ```

> **Security note:** `SKINPORT_API_URL` must target `https://api.skinport.com/v1/items`; other hosts are rejected to avoid proxying to untrusted destinations.

> **Offline note:** When `USE_SKINPORT_FALLBACK` is `true` (default), the API will return bundled sample prices if the live Skinport request fails (useful in CI or networks where the API is blocked).

3. Start dependencies (PostgreSQL + Redis):

   ```powershell
   docker compose up -d
   ```

4. Apply the schema and seed demo data (idempotent thanks to unique constraints on usernames and product names):

   ```powershell
   Get-Content .\schema.sql | docker compose exec -T postgres psql -U postgres -d skinport
   ```

5. Run the API in development mode:

   ```powershell
   npm run dev
   ```

   Interactive API docs: http://localhost:3000/docs

6. Build and run in production mode (do not run dev and prod servers simultaneously):

   ```powershell
   npm run build
   npm start
   ```

## Skinport API usage

Skinport requires Brotli compression for the `/v1/items` endpoint. Always send `Accept-Encoding: br` or the API will reply with `406 not_acceptable`. A minimal fetch example:

```ts
const url = new URL('https://api.skinport.com/v1/items');
url.searchParams.set('app_id', '730');
url.searchParams.set('currency', 'EUR');

const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Accept-Encoding': 'br',
    Accept: 'application/json'
  }
});

if (!response.ok) {
  throw new Error(`Skinport API responded with ${response.status}`);
}

const data = await response.json();
```

> **Tip:** Older cURL builds (notably on Windows) may not support Brotli. Use Node 20+ (which supports Brotli by default) or a cURL build with `--compressed` + `-H "Accept-Encoding: br"` on platforms that support it.

## Endpoints

### `GET /items`
Returns an array with minimal prices for tradable and non-tradable variants of each Skinport item. Responses are cached in Redis for `ITEM_CACHE_TTL` seconds.

### `POST /purchase`
Headers:

- `Authorization: Bearer <token>` — tokens are configured in `USER_API_KEYS` and mapped to user IDs.

Body:

```json
{ "productId": 2 }
```

Performs a transactional purchase on behalf of the authenticated user, deducts the product price from the user balance, records the purchase, and responds with the updated balance.

## POST requests in Postman

Example setup for `POST /purchase`:

1. Create a new request with method **POST** and URL `http://localhost:3000/purchase`.
2. In the **Headers** tab, add `Authorization` with value `Bearer <token>` (token must match a configured entry in `USER_API_KEYS`).
3. In the **Body** tab, choose **raw** → **JSON** and enter:

   ```json
   { "productId": 2 }
   ```
4. Send the request to receive the updated balance after the purchase is processed.
