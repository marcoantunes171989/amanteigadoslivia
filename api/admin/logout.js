import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminLogout } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminLogout(request, response, { getPool, logDatabaseError });
}
