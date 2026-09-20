import assert from 'node:assert/strict';
import { test } from 'node:test';
import { broadcastCatalogUpdated, CATALOG_CHANNEL, CATALOG_EVENT } from './catalog-revision.js';

test('broadcastCatalogUpdated posts to the Realtime HTTP endpoint before falling back', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  try {
    const ok = await broadcastCatalogUpdated('rev-1');
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.supabase.co/realtime/v1/api/broadcast');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.messages[0].topic, CATALOG_CHANNEL);
    assert.equal(body.messages[0].event, CATALOG_EVENT);
    assert.equal(body.messages[0].payload.revisao, 'rev-1');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer service-role-test');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
