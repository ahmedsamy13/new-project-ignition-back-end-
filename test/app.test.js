import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import express from 'express';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { requestContext } from '../src/middleware/request-context.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createItemsRepository } from '../src/features/items/items.repository.js';
import { createItemsService } from '../src/features/items/items.service.js';

const contract = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function startServer(t, options = {}) {
  const logs = [];
  const logger = (level, event, metadata) => logs.push({ level, event, ...metadata });
  const app = options.app ?? createApp({ config: readConfig(options.env ?? { NODE_ENV: 'test' }), logger });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { request: (path, init) => fetch(`${baseUrl}${path}`, init), logs };
}

const postJson = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  assert.match(body.requestId, uuidPattern);
  assert.equal(response.headers.get('x-request-id'), body.requestId);
  assert.ok(contract.components.schemas.ErrorResponse.properties.error.properties.code.enum.includes(code));
  assert.equal('stack' in body.error, false);
  return body;
}

test('configuration has typed safe defaults and rejects unsafe or invalid settings', () => {
  const config = readConfig({});
  assert.equal(config.port, 3000);
  assert.equal(config.jsonBodyLimit, 16384);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.trustProxy, false);
  assert.deepEqual(config.corsOrigins, []);
  for (const env of [
    { PORT: '0' }, { PORT: '3000abc' }, { NODE_ENV: 'invalid' }, { HOST: 'bad host' },
    { CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'https://example.com/path' },
    { CORS_ORIGINS: 'https://user:secret@example.com' },
    { TRUST_PROXY: 'true' }, { TRUST_PROXY: '1' }, { TRUST_PROXY: '127.0.0.1/33' },
    { JSON_BODY_LIMIT: '0' },
  ]) assert.throws(() => readConfig(env), /Invalid environment configuration:/);
  assert.deepEqual(readConfig({ TRUST_PROXY: '127.0.0.1,::1/128' }).trustProxy, ['127.0.0.1', '::1/128']);
});

test('startup fails before listening and reports only invalid configuration field names', () => {
  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'test', PORT: 'secret-value' },
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid environment configuration: PORT/);
  assert.doesNotMatch(result.stderr, /secret-value/);
  assert.doesNotMatch(result.stdout, /server_started/);
});

test('health reveals only status and includes security and privacy headers', async (t) => {
  const { request } = await startServer(t);
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), contract.paths['/health'].get.responses['200'].content['application/json'].example);
  assert.match(response.headers.get('x-request-id'), uuidPattern);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('create, retrieve, and paginate follow the documented API', async (t) => {
  const { request } = await startServer(t);
  const initial = await request('/api/v1/items');
  assert.deepEqual(await initial.json(), contract.paths['/api/v1/items'].get.responses['200'].content['application/json'].example);
  const input = contract.paths['/api/v1/items'].post.requestBody.content['application/json'].example;
  const created = await request('/api/v1/items', postJson({ name: `  ${input.name}  ` }));
  assert.equal(created.status, 201);
  const item = (await created.json()).data;
  assert.match(item.id, uuidPattern);
  assert.equal(item.name, input.name);
  assert.ok(Number.isFinite(Date.parse(item.createdAt)));
  assert.equal(created.headers.get('location'), `/api/v1/items/${item.id}`);
  const retrieved = await request(created.headers.get('location'));
  assert.deepEqual(await retrieved.json(), { success: true, data: item });
  await request('/api/v1/items', postJson({ name: 'Second item' }));
  const page = await request('/api/v1/items?limit=1&offset=1');
  const body = await page.json();
  assert.deepEqual(body.meta, { limit: 1, offset: 1, total: 2 });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].name, 'Second item');
});

test('invalid bodies, unknown fields, query values, and path IDs are rejected', async (t) => {
  const { request } = await startServer(t);
  for (const input of [{}, { name: '   ' }, { name: 123 }, { name: 'x'.repeat(101) }, { name: 'Valid', isAdmin: true }, []]) {
    const body = await expectError(await request('/api/v1/items', postJson(input)), 400, 'VALIDATION_ERROR');
    assert.ok(body.error.details.length > 0);
  }
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'limit=1.5', 'limit=2&limit=3', 'unexpected=value']) {
    await expectError(await request(`/api/v1/items?${query}`), 400, 'VALIDATION_ERROR');
  }
  await expectError(await request('/api/v1/items/not-a-uuid'), 400, 'VALIDATION_ERROR');
});

test('malformed, oversized, compressed, and non-JSON bodies get safe errors', async (t) => {
  const { request } = await startServer(t);
  await expectError(await request('/api/v1/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":' }), 400, 'INVALID_JSON');
  await expectError(await request('/api/v1/items', postJson({ name: 'x'.repeat(17000) })), 413, 'PAYLOAD_TOO_LARGE');
  await expectError(await request('/api/v1/items', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  await expectError(await request('/api/v1/items', { ...postJson({ name: 'hello' }), headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } }), 415, 'UNSUPPORTED_ENCODING');
});

test('unknown endpoints and asynchronous missing-item errors use the same envelope', async (t) => {
  const { request } = await startServer(t);
  await expectError(await request('/unknown'), 404, 'NOT_FOUND');
  await expectError(await request(`/api/v1/items/${randomUUID()}`), 404, 'ITEM_NOT_FOUND');
});

test('empty CORS allowlist blocks cross-origin browsers but permits ordinary CLI requests', async (t) => {
  const { request } = await startServer(t);
  assert.equal((await request('/health')).status, 200);
  await expectError(await request('/health', { headers: { Origin: 'https://example.com' } }), 403, 'ORIGIN_NOT_ALLOWED');
});

test('configured CORS allows exactly the selected origin and answers preflight', async (t) => {
  const origin = 'http://localhost:5173';
  const { request } = await startServer(t, { env: { NODE_ENV: 'test', CORS_ORIGINS: origin } });
  const response = await request('/health', { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  const preflight = await request('/api/v1/items', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
  await expectError(await request('/health', { headers: { Origin: 'http://127.0.0.1:5173' } }), 403, 'ORIGIN_NOT_ALLOWED');
});

test('logs exclude request bodies, raw paths, query strings, headers, and client request IDs', async (t) => {
  const { request, logs } = await startServer(t);
  await request('/private-path-secret?token=query-secret', { headers: { Authorization: 'Bearer header-secret', 'X-Request-Id': 'client-secret' } });
  await request('/api/v1/items', postJson({ name: 'body-secret' }));
  assert.equal(logs.length, 2);
  const serialized = JSON.stringify(logs);
  for (const secret of ['private-path-secret', 'query-secret', 'header-secret', 'client-secret', 'body-secret']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.ok(logs.every((entry) => uuidPattern.test(entry.requestId)));
});

test('unexpected async errors hide raw messages in both responses and logs', async (t) => {
  const logs = [];
  const logger = (level, event, metadata) => logs.push({ level, event, ...metadata });
  const app = express();
  app.use(requestContext(logger));
  app.get('/failure', async () => { throw new Error('database-password=secret'); });
  app.use(errorHandler(logger));
  const { request } = await startServer(t, { app });
  const body = await expectError(await request('/failure'), 500, 'INTERNAL_ERROR');
  assert.equal(body.error.message, 'An unexpected error occurred.');
  assert.equal(JSON.stringify({ body, logs }).includes('database-password'), false);
  assert.ok(logs.some((entry) => entry.event === 'request_failed'));
});

test('each app gets isolated example storage', async (t) => {
  const first = await startServer(t);
  const second = await startServer(t);
  await first.request('/api/v1/items', postJson({ name: 'First app only' }));
  assert.equal((await (await first.request('/api/v1/items')).json()).meta.total, 1);
  assert.equal((await (await second.request('/api/v1/items')).json()).meta.total, 0);
});

test('concurrent writes cannot exceed the bounded example store', async () => {
  const service = createItemsService(createItemsRepository());
  const results = await Promise.allSettled(Array.from({ length: 1001 }, () => service.create({ name: 'Example' })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1000);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.status, 409);
  assert.equal(rejected.reason.code, 'EXAMPLE_CAPACITY_REACHED');
});

test('OpenAPI parses and all local references resolve', () => {
  assert.equal(contract.openapi, '3.1.0');
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'));
      const resolved = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key], contract);
      assert.ok(resolved, `Unresolved reference: ${value.$ref}`);
    }
    Object.values(value).forEach(walk);
  };
  walk(contract);
});
