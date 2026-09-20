import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveImageStoragePath } from './admin-storage.js';

test('branding uploads keep official topo and rodape storage paths', () => {
  assert.equal(
    resolveImageStoragePath({ pasta: 'site/branding', nome_arquivo: 'logo-topo.jpeg', extension: 'jpg' }),
    'site/branding/logo-topo.jpeg',
  );
  assert.equal(
    resolveImageStoragePath({ pasta: 'site/branding', nome_arquivo: 'logo-rodape.JPEG', extension: 'jpg' }),
    'site/branding/logo-rodape.jpeg',
  );
});

test('non-branding uploads stay in hashed folders', () => {
  const site = resolveImageStoragePath({ pasta: 'site', nome_arquivo: 'hero.jpeg', extension: 'jpg' });
  const product = resolveImageStoragePath({ pasta: 'produtos', nome_arquivo: 'cookie.png', extension: 'png' });
  assert.match(site, /^site\/[0-9a-f-]{36}\.jpg$/);
  assert.match(product, /^produtos\/[0-9a-f-]{36}\.png$/);
});
