import { getPool, logDatabaseError } from '../../catalogo.js';
import { handleAdminUploadUrl } from '../../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminUploadUrl(request, response, { getPool, logDatabaseError });
}
