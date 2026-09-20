import { getPool, logDatabaseError } from '../catalogo.js';
import { handlePublicVenda } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handlePublicVenda(request, response, { getPool, logDatabaseError });
}
