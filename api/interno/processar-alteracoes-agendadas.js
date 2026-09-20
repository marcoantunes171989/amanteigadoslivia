import { getPool, logDatabaseError } from '../../catalogo.js';
import { handleProcessScheduledChanges } from '../../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleProcessScheduledChanges(request, response, { getPool, logDatabaseError });
}
