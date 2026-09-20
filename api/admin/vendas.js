import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminVendas } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminVendas(request, response, { getPool, logDatabaseError });
}
