import { randomUUID } from 'node:crypto';
import { AdminError } from './admin-errors.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateImageUploadMeta({ nome_arquivo, tipo_mime, tamanho_bytes }) {
  const mime = String(tipo_mime || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME.includes(mime)) {
    throw new AdminError(400, 'validation_error', 'Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.');
  }
  const size = Number(tamanho_bytes);
  if (!Number.isInteger(size) || size <= 0) {
    throw new AdminError(400, 'validation_error', 'Tamanho da imagem inválido.');
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new AdminError(400, 'validation_error', 'A imagem deve ter no máximo 2 MB.');
  }
  const original = String(nome_arquivo || '').trim();
  if (!original) {
    throw new AdminError(400, 'validation_error', 'Nome do arquivo é obrigatório.');
  }
  return {
    mime,
    size,
    extension: EXTENSION_BY_MIME[mime],
  };
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new AdminError(503, 'storage_unavailable', 'Armazenamento de imagens não configurado.');
  }
  return value;
}

async function getSupabaseAdmin() {
  const url = requiredEnv('SUPABASE_URL');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createSignedImageUpload({ nome_arquivo, tipo_mime, tamanho_bytes }) {
  const meta = validateImageUploadMeta({ nome_arquivo, tipo_mime, tamanho_bytes });
  const supabase = await getSupabaseAdmin();
  const pathName = `produtos/${randomUUID()}.${meta.extension}`;

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      throw new AdminError(503, 'storage_unavailable', 'Não foi possível preparar o armazenamento de imagens.');
    }
    const exists = (buckets || []).some((bucket) => bucket.name === 'produto-imagens');
    if (!exists) {
      const { error: bucketError } = await supabase.storage.createBucket('produto-imagens', {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: [...ALLOWED_IMAGE_MIME],
      });
      if (bucketError && !/exist|duplicate|already/i.test(String(bucketError.message || ''))) {
        throw new AdminError(503, 'storage_unavailable', 'Não foi possível preparar o armazenamento de imagens.');
      }
    }

  const { data, error } = await supabase.storage
    .from('produto-imagens')
    .createSignedUploadUrl(pathName);
  if (error || !data?.signedUrl) {
    throw new AdminError(503, 'storage_unavailable', 'Não foi possível preparar o envio da imagem.');
  }

  const publicUrl = `${String(process.env.SUPABASE_URL).replace(/\/$/, '')}/storage/v1/object/public/produto-imagens/${pathName}`;
  return {
    path: pathName,
    signed_upload_url: data.signedUrl,
    public_url: data.publicUrl || publicUrl,
    token: data.token || null,
  };
}
