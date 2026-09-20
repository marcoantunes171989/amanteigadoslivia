import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminRelatorios } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminRelatorios(request, response, { getPool, logDatabaseError });
}
