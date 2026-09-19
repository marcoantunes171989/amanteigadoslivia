import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminCatalog } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminCatalog(request, response, { getPool, logDatabaseError });
}
