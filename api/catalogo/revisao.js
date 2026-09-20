import { getPool, logDatabaseError } from '../catalogo.js';
import { handleCatalogRevision } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleCatalogRevision(request, response, { getPool, logDatabaseError });
}
