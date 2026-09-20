export async function withTransaction(pool, fn) {
  const isClient = typeof pool.release === 'function';
  const isPool = typeof pool.connect === 'function' && !isClient;

  if (isPool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // rollback best-effort
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // Cliente já em transação (ex.: processador de alterações agendadas):
  // participa da transação externa sem BEGIN/COMMIT aninhados.
  if (typeof pool.release === 'function') {
    return fn(pool);
  }

  await pool.query('BEGIN');
  try {
    const result = await fn(pool);
    await pool.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch {
      // rollback best-effort
    }
    throw error;
  }
}
