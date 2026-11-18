import { getPool, logDatabaseError } from './catalogo.js';
import { handlePublicTemaCss } from '../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handlePublicTemaCss(request, response, { getPool, logDatabaseError });
}
