import { handleAdminLogin } from '../../backend/src/admin-http.js';

export default async function handler(request, response) {
  await handleAdminLogin(request, response);
}
