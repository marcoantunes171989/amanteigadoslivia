// Resolve a configuracao do Pool do runtime serverless (Vercel + Supabase Supavisor).
// Modulo puro: recebe `env` e devolve opcoes do pg.Pool. Nao abre conexao.

export const DEFAULT_APPLICATION_NAME = 'amanteigados-livia-api';
export const SUPABASE_POOLER_SUFFIX = '.pooler.supabase.com';
export const SUPABASE_POOLER_PORT = 6543;

export class DatabaseConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseConfigError';
    this.code = 'database_config_invalid';
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isSupabasePoolerHost(host) {
  return clean(host).toLowerCase().endsWith(SUPABASE_POOLER_SUFFIX);
}

// Igualdade exata (nao por sufixo/substring): localhost.example.com e 127.0.0.1.example.com continuam remotos.
export const LOCAL_DATABASE_HOSTS = Object.freeze(['localhost', '127.0.0.1']);

export function isLocalDatabaseHost(host) {
  return LOCAL_DATABASE_HOSTS.includes(clean(host).toLowerCase());
}

// Postgres local (sem SSL) so para localhost/127.0.0.1; demais hosts mantem o SSL atual.
function resolveSsl(host) {
  return isLocalDatabaseHost(host) ? false : { rejectUnauthorized: false };
}

function hostnameOfConnectionString(connectionString) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    // URL invalida: nao presume local; SSL permanece habilitado.
    return '';
  }
}

export function resolveApplicationName(env = process.env) {
  return clean(env.DATABASE_APPLICATION_NAME) || DEFAULT_APPLICATION_NAME;
}

function parsePort(rawPort) {
  const text = clean(rawPort);
  if (!text) {
    throw new DatabaseConfigError('DATABASE_PORT is required when DATABASE_HOST is configured');
  }
  if (!/^\d{1,5}$/.test(text)) {
    throw new DatabaseConfigError('DATABASE_PORT must be a valid TCP port number');
  }
  const port = Number(text);
  if (port < 1 || port > 65535) {
    throw new DatabaseConfigError('DATABASE_PORT must be a valid TCP port number');
  }
  return port;
}

// DATABASE_HOST presente => variaveis discretas mandam e DATABASE_URL e ignorada.
// DATABASE_HOST ausente => fallback de compatibilidade para DATABASE_URL.
export function resolvePoolConfig(env = process.env) {
  const host = clean(env.DATABASE_HOST);
  const applicationName = resolveApplicationName(env);

  if (host) {
    const port = parsePort(env.DATABASE_PORT);
    if (isSupabasePoolerHost(host) && port !== SUPABASE_POOLER_PORT) {
      throw new DatabaseConfigError(
        `DATABASE_PORT must be ${SUPABASE_POOLER_PORT} for Supabase pooler hosts (transaction mode)`,
      );
    }
    return {
      mode: 'discrete',
      options: {
        host,
        port,
        database: env.DATABASE_NAME,
        user: env.DATABASE_USER,
        password: env.DATABASE_PASSWORD,
        ssl: resolveSsl(host),
        application_name: applicationName,
      },
    };
  }

  const connectionString = clean(env.DATABASE_URL);
  if (!connectionString) {
    throw new DatabaseConfigError('DATABASE_HOST or DATABASE_URL is required');
  }
  return {
    mode: 'url',
    options: {
      connectionString: env.DATABASE_URL,
      ssl: resolveSsl(hostnameOfConnectionString(connectionString)),
      application_name: applicationName,
    },
  };
}
