import { getPool, logDatabaseError } from './catalogo.js';
import { handlePublicPedido } from '../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handlePublicPedido(request, response, { getPool, logDatabaseError });
}
