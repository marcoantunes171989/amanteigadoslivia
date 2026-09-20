import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminAuditoria } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminAuditoria(request, response, { getPool, logDatabaseError });
}
