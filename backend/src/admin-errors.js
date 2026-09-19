export class AdminError extends Error {
  constructor(status, code, message) {
    super(message || code);
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
  ].includes(code);
}

export function mapDatabaseError(error) {
  if (error instanceof AdminError) {
    return error;
  }

  if (error?.code === '23505') {
    return new AdminError(409, 'conflict', 'Já existe um registro com este slug.');
  }
  if (error?.code === '23503') {
    return new AdminError(400, 'validation_error', 'Registro relacionado inválido.');
  }
  if (error?.code === '23514') {
    return new AdminError(400, 'validation_error', 'Dados inválidos para o catálogo.');
  }
  if (isDatabaseUnavailable(error)) {
    return new AdminError(503, 'database_unavailable', 'Catálogo temporariamente indisponível.');
  }

  return new AdminError(500, 'internal_error', 'Não foi possível concluir a operação.');
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
