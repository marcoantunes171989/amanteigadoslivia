import { getPool, logDatabaseError } from './catalogo.js';
import { handlePublicEmpresa } from '../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handlePublicEmpresa(request, response, { getPool, logDatabaseError });
}
