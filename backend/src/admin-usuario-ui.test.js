import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// O painel não tem harness de DOM. Estes testes travam, nos arquivos reais,
// os pontos de UI pedidos: label Usuário, login sem E-mail e controle compacto.
const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

test('UI login: label Usuário e campo usuario; nenhum campo de E-mail no login', () => {
  const html = read('admin.html');
  const loginBlock = html.slice(html.indexOf('id="loginForm"'), html.indexOf('id="loginButton"'));
  assert.match(loginBlock, /<label for="adminLogin">Usuário<\/label>/);
  assert.match(loginBlock, /<input id="adminLogin" name="usuario"/);
  assert.doesNotMatch(loginBlock, /E-mail|adminEmail|type="email"/);
});

test('UI login: admin.js envia usuario (não email) e mensagem genérica de usuário', () => {
  const js = read('admin.js');
  assert.match(js, /getElementById\('adminLogin'\)\.value/);
  assert.doesNotMatch(js, /getElementById\('adminEmail'\)/);
  assert.match(js, /Usuário ou senha inválidos\./);
});

test('UI cadastro: modal "Novo usuário" tem campo Usuário * entre Nome e E-mail', () => {
  const js = read('admin.js');
  const nome = js.indexOf("field('nome', 'Nome *'");
  const usuario = js.indexOf("field('usuario', 'Usuário *'");
  const email = js.indexOf("field('email', 'E-mail *'");
  assert.ok(nome > 0 && usuario > nome && email > usuario, 'ordem esperada: Nome, Usuário, E-mail');
  assert.match(js, /usuario: usuarioLogin/);
});

test('UI cadastro: validação de Usuário no front espelha o backend', () => {
  const js = read('admin.js');
  assert.match(js, /\/\^\[a-z0-9\._-\]\+\$\//);
  assert.match(js, /entre 3 e 32 caracteres/);
});

test('UI cadastro: ADMIN/Gerente mantêm dica de PIN e SUPER_ADMIN mantém dica forte', () => {
  const js = read('admin.js');
  assert.match(js, /PIN_HINT/);
  assert.match(js, /SENHA_HINT/);
});

test('UI listagem: coluna Usuário na tabela e no card mobile', () => {
  const js = read('admin.js');
  assert.match(js, /\['Nome', 'Usuário', 'E-mail'/);
  assert.match(js, /user\.login_usuario \|\| '—'/);
});

test('UI status ativo: usa controle compacto statusToggle, não o checkbox genérico', () => {
  const js = read('admin.js');
  assert.match(js, /statusToggle\('ativo', 'Status ativo'/);
  assert.doesNotMatch(js, /checkbox\('ativo', 'Status ativo'/);
  assert.match(js, /className: 'status-toggle'/);
});

test('UI status ativo: CSS não aplica estilo de campo de texto ao checkbox e define tamanho compacto', () => {
  const css = read('admin.css');
  assert.match(css, /\.admin-dialog input:not\(\[type="checkbox"\]\),/);
  assert.doesNotMatch(css, /\n\.admin-dialog input,\r?\n/);
  const rule = css.slice(css.indexOf('.status-toggle input[type="checkbox"] {'));
  assert.match(rule.slice(0, 260), /width: 16px;/);
  assert.match(rule.slice(0, 260), /height: 16px;/);
  assert.match(css, /\.status-toggle input\[type="checkbox"\]:focus-visible/);
});
