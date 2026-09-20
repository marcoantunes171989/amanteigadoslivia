import { randomUUID } from 'node:crypto';
import { buildRealtimeBroadcastBody, realtimeBroadcastUrl } from '../../ui-core.js';

export const CATALOG_CHANNEL = 'catalogo-homolog';
export const CATALOG_EVENT = 'catalogo_atualizado';
export const SITE_EVENT = 'site_atualizado';

export async function getCatalogRevision(queryable, now = new Date()) {
  let revisaoDate = null;
  let proxima = null;
  const combinedSql = `
      SELECT GREATEST(
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_categoria), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_categoria), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_produto), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto_imagem), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto_preco), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_aplicacao) FROM app.tab_alteracao_agendada), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_venda) FROM app.tab_venda), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_configuracao_site), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_conteudo_site), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_conteudo_imagem), '-infinity'::timestamptz)
      ) AS revisao,
      (
        SELECT MIN(data_vigencia)
        FROM app.tab_alteracao_agendada
        WHERE status_alteracao = 'AGENDADA' AND data_vigencia > $1
      ) AS proxima_atualizacao
  `;
  try {
    const revisionResult = await queryable.query(combinedSql, [now.toISOString()]);
    revisaoDate = revisionResult.rows[0]?.revisao;
    proxima = revisionResult.rows[0]?.proxima_atualizacao || null;
  } catch {
    try {
      const fallback = await queryable.query(`
        SELECT GREATEST(
          COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_categoria), '-infinity'::timestamptz),
          COALESCE((SELECT MAX(data_criacao) FROM app.tab_categoria), '-infinity'::timestamptz),
          COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_produto), '-infinity'::timestamptz),
          COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto), '-infinity'::timestamptz),
          COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto_imagem), '-infinity'::timestamptz),
          COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto_preco), '-infinity'::timestamptz)
        ) AS revisao
      `);
      revisaoDate = fallback.rows[0]?.revisao;
    } catch {
      revisaoDate = now;
    }
  }

  const revisao = revisaoDate && revisaoDate !== '-infinity'
    ? new Date(revisaoDate).toISOString()
    : '0';

  return {
    revisao,
    proxima_atualizacao: proxima ? new Date(proxima).toISOString() : null,
    realtime: getPublicRealtimeConfig(),
  };
}

export function getPublicRealtimeConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) {
    return null;
  }
  return {
    url,
    anon_key: anon,
    channel: CATALOG_CHANNEL,
    event: CATALOG_EVENT,
    site_event: SITE_EVENT,
  };
}

async function broadcastViaHttp(url, key, payload, eventName = CATALOG_EVENT) {
  const response = await fetch(realtimeBroadcastUrl(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(buildRealtimeBroadcastBody(CATALOG_CHANNEL, eventName, payload)),
  });
  return response.ok;
}

async function broadcastViaRealtimeClient(url, key, payload, eventName = CATALOG_EVENT) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const channel = supabase.channel(CATALOG_CHANNEL, {
    config: { broadcast: { ack: true } },
  });
  const subscribed = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 2500);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve(true);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });
  if (!subscribed) {
    await supabase.removeChannel(channel);
    return false;
  }
  const result = await channel.send({
    type: 'broadcast',
    event: eventName,
    payload,
  });
  await supabase.removeChannel(channel);
  return result === 'ok';
}

async function broadcastEvent(eventName, revisao) {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    return false;
  }
  const payload = { revisao: revisao || randomUUID(), event: eventName };
  try {
    if (await broadcastViaHttp(url, key, payload, eventName)) {
      return true;
    }
  } catch {
    // HTTP broadcast pode falhar em ambiente sem Realtime HTTP; tenta o cliente.
  }
  try {
    return await broadcastViaRealtimeClient(url, key, payload, eventName);
  } catch {
    return false;
  }
}

export async function broadcastCatalogUpdated(revisao) {
  return broadcastEvent(CATALOG_EVENT, revisao);
}

export async function broadcastSiteUpdated(revisao) {
  return broadcastEvent(SITE_EVENT, revisao);
}
