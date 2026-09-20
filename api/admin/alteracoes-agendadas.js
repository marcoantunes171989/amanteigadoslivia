import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminAlteracoes } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminAlteracoes(request, response, { getPool, logDatabaseError });
}
