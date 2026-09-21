import { randomUUID } from 'node:crypto';

const SECRET_KEYS = /senha|password|secret|salt|hash|token|connection.?string|database.?url|service.?role/i;

export function sanitizeAuditDetails(details) {
  if (details == null || typeof details !== 'object') {
    return details ?? null;
  }
  if (Array.isArray(details)) {
    return details.map((item) => sanitizeAuditDetails(item));
  }
  const clean = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET_KEYS.test(key)) {
      continue;
    }
    if (value && typeof value === 'object') {
      clean[key] = sanitizeAuditDetails(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export async function recordAudit(queryable, event = {}) {
  if (!queryable || typeof queryable.query !== 'function') {
    return null;
  }
  const id = event.id_auditoria || randomUUID();
  try {
    await queryable.query(
      `-- op:insert_auditoria
        INSERT INTO app.tab_auditoria_admin (
          id_auditoria, id_usuario_admin, acao, entidade, id_registro,
          sucesso, descricao_evento, detalhes_json, identificador_requisicao
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        id,
        event.id_usuario_admin || null,
        event.acao,
        event.entidade || null,
        event.id_registro || null,
        event.sucesso === true,
        event.descricao_evento || null,
        event.detalhes_json != null ? JSON.stringify(sanitizeAuditDetails(event.detalhes_json)) : null,
        event.identificador_requisicao || null,
      ],
    );
  } catch {
    // Auditoria e best-effort: nunca derruba a operacao principal.
  }
  return id;
}

export const AUDIT_PAGE_LIMIT = 10;
export const AUDIT_CSV_MAX_ROWS = 300;

export function parseAuditPagination(query = {}) {
  const parsed = Number.parseInt(String(query.pagina ?? '1'), 10);
  const pagina = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
  return {
    pagina,
    limite: AUDIT_PAGE_LIMIT,
  };
}

export function auditPaginationMeta(total, pagina = 1) {
  const limite = AUDIT_PAGE_LIMIT;
  const count = Number(total) || 0;
  return {
    pagina,
    limite,
    total: count,
    total_paginas: Math.max(1, Math.ceil(count / limite)),
  };
}

export const AUDIT_ACTIONS = Object.freeze({
  LOGIN_SUCESSO: 'LOGIN_SUCESSO',
  LOGIN_FALHA: 'LOGIN_FALHA',
  LOGOUT: 'LOGOUT',
  CRIAR_CATEGORIA: 'CRIAR_CATEGORIA',
  EDITAR_CATEGORIA: 'EDITAR_CATEGORIA',
  ATIVAR_CATEGORIA: 'ATIVAR_CATEGORIA',
  DESATIVAR_CATEGORIA: 'DESATIVAR_CATEGORIA',
  CRIAR_PRODUTO: 'CRIAR_PRODUTO',
  EDITAR_PRODUTO: 'EDITAR_PRODUTO',
  ATIVAR_PRODUTO: 'ATIVAR_PRODUTO',
  DESATIVAR_PRODUTO: 'DESATIVAR_PRODUTO',
  ALTERAR_PRECO: 'ALTERAR_PRECO',
  CRIAR_PROMOCAO: 'CRIAR_PROMOCAO',
  REMOVER_PROMOCAO: 'REMOVER_PROMOCAO',
  ALTERAR_IMAGEM: 'ALTERAR_IMAGEM',
  AGENDAR_ALTERACAO: 'AGENDAR_ALTERACAO',
  CANCELAR_ALTERACAO: 'CANCELAR_ALTERACAO',
  PUBLICACAO_HML_PROD: 'PUBLICACAO_HML_PROD',
  CRIAR_USUARIO: 'CRIAR_USUARIO',
  EDITAR_USUARIO: 'EDITAR_USUARIO',
  ATIVAR_USUARIO: 'ATIVAR_USUARIO',
  DESATIVAR_USUARIO: 'DESATIVAR_USUARIO',
  RESETAR_SENHA: 'RESETAR_SENHA',
  REDEFINIR_SENHA: 'RESETAR_SENHA',
  CONFIRMAR_VENDA: 'CONFIRMAR_VENDA',
  CANCELAR_VENDA: 'CANCELAR_VENDA',
  EDITAR_CONTEUDO_SITE: 'EDITAR_CONTEUDO_SITE',
  ALTERAR_BRANDING: 'ALTERAR_BRANDING',
  ALTERAR_GALERIA: 'ALTERAR_GALERIA',
  ALTERAR_CONFIGURACAO_SITE: 'ALTERAR_CONFIGURACAO_SITE',
  ALTERAR_SOLICITACAO: 'ALTERAR_SOLICITACAO',
});
