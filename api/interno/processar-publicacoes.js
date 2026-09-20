import { getPool, logDatabaseError } from '../../catalogo.js';
import { handleProcessPublications } from '../../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleProcessPublications(request, response, { getPool, logDatabaseError });
}
