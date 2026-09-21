export class AdminError extends Error {
  constructor(status, code, message, options = {}) {
    super(message || code, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AdminError';
    this.status = status;
    this.code = code;
  }
}

export function isDatabaseUnavailable(error) {
  const code = error?.code;
  return [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNRESET',
    '08000',
    '08001',
    '08003',
    '08006',
    '57P01',
    '57P02',
    '57P03',
    '53300',
  ].includes(code);
}

export function mapDatabaseError(error) {
  if (error instanceof AdminError) {
    return error;
  }

  if (error?.code === '23505') {
    const constraint = String(error?.constraint || error?.detail || '');
    if (/email/i.test(constraint)) {
      return new AdminError(409, 'conflict', 'Já existe um usuário com este e-mail.');
    }
    if (/idempotencia/i.test(constraint)) {
      return new AdminError(409, 'conflict', 'Pedido já registrado.');
    }
    return new AdminError(409, 'conflict', 'Já existe um registro com estes dados.');
  }
  if (error?.code === '23503') {
    return new AdminError(400, 'validation_error', 'Registro relacionado inválido.');
  }
  if (error?.code === '23514') {
    return new AdminError(400, 'validation_error', 'Dados inválidos para o catálogo.');
  }
  if (error?.code === '23001') {
    return new AdminError(403, 'forbidden', 'Operação não permitida para este usuário.');
  }
  if (isDatabaseUnavailable(error)) {
    return new AdminError(
      503,
      'database_unavailable',
      'Serviço temporariamente indisponível. Tente novamente em instantes.',
      { cause: error },
    );
  }

  return new AdminError(500, 'internal_error', 'Não foi possível concluir a operação.', { cause: error });
}

// Campos seguros para log server-side: SQLSTATE, nome do erro e mensagem sem
// o nome de role/usuário (ex.: too many connections for role "...").
export function safeDatabaseErrorLog(error) {
  return {
    code: error?.code || 'unknown',
    name: error?.name || 'Error',
    message: String(error?.message || 'unknown error').replace(/\b(role|user) "[^"]*"/gi, '$1 "[redacted]"'),
  };
}

export function toClientError(error) {
  if (error instanceof AdminError) {
    return {
      status: error.status,
      body: {
        error: error.code,
        message: error.message,
      },
    };
  }

  const mapped = mapDatabaseError(error);
  return {
    status: mapped.status,
    body: {
      error: mapped.code,
      message: mapped.message,
    },
  };
}
