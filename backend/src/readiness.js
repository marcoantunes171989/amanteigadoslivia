import { checkDatabaseConnection } from './database.js';

export async function checkReadiness() {
  try {
    const result = await checkDatabaseConnection();

    if (result && result.ok === true) {
      return Object.freeze({
        ready: true,
        database: 'ready',
      });
    }
  } catch {
    // fall through to the not-ready result below; no internal detail is exposed
  }

  return Object.freeze({
    ready: false,
    database: 'not_ready',
  });
}
