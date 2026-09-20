import { getPool, logDatabaseError } from '../catalogo.js';
import { handleAdminUsuarios } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminUsuarios(request, response, { getPool, logDatabaseError });
}
