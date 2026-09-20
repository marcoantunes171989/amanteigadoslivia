import { randomUUID } from 'node:crypto';
import { buildRealtimeBroadcastBody, realtimeBroadcastUrl } from '../../ui-core.js';

export const CATALOG_CHANNEL = 'catalogo-homolog';
export const CATALOG_EVENT = 'catalogo_atualizado';

export async function getCatalogRevision(queryable, now = new Date()) {
  let revisaoDate = null;
  let proxima = null;
  try {
    const revisionResult = await queryable.query(`
      SELECT GREATEST(
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_categoria), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_categoria), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_produto), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto_imagem), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_criacao) FROM app.tab_produto_preco), '-infinity'::timestamptz)
      ) AS revisao
    `);
    revisaoDate = revisionResult.rows[0]?.revisao;
  } catch {
    revisaoDate = now;
  }

  try {
    const extra = await queryable.query(`
      SELECT GREATEST(
        COALESCE((SELECT MAX(data_aplicacao) FROM app.tab_alteracao_agendada), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_venda) FROM app.tab_venda), '-infinity'::timestamptz)
      ) AS revisao
    `);
    const extraDate = extra.rows[0]?.revisao;
    if (extraDate && (!revisaoDate || new Date(extraDate) > new Date(revisaoDate))) {
      revisaoDate = extraDate;
    }
  } catch {
    // tabelas novas podem ainda nao existir em testes isolados
  }

  try {
    const next = await queryable.query(`
      SELECT MIN(data_vigencia) AS proxima_atualizacao
      FROM app.tab_alteracao_agendada
      WHERE status_alteracao = 'AGENDADA' AND data_vigencia > $1
    `, [now.toISOString()]);
    proxima = next.rows[0]?.proxima_atualizacao || null;
  } catch {
    proxima = null;
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
  };
}

async function broadcastViaHttp(url, key, payload) {
  const response = await fetch(realtimeBroadcastUrl(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(buildRealtimeBroadcastBody(CATALOG_CHANNEL, CATALOG_EVENT, payload)),
  });
  return response.ok;
}

async function broadcastViaRealtimeClient(url, key, payload) {
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
    event: CATALOG_EVENT,
    payload,
  });
  await supabase.removeChannel(channel);
  return result === 'ok';
}

export async function broadcastCatalogUpdated(revisao) {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    return false;
  }
  const payload = { revisao: revisao || randomUUID() };
  try {
    if (await broadcastViaHttp(url, key, payload)) {
      return true;
    }
  } catch {
    // HTTP broadcast pode falhar em ambiente sem Realtime HTTP; tenta o cliente.
  }
  try {
    return await broadcastViaRealtimeClient(url, key, payload);
  } catch {
    return false;
  }
}
