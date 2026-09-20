import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminPublicacoes } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminPublicacoes(request, response, { getPool, logDatabaseError });
}
