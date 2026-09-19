import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '..', '.env');

const ALLOWED_NODE_ENVS = Object.freeze(['development', 'test', 'production']);
const MIN_PORT = 1;
const MAX_PORT = 65535;

const REQUIRED_APP_VARS = Object.freeze([
  'NODE_ENV',
  'HOST',
  'PORT',
]);

const REQUIRED_DB_VARS = Object.freeze([
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
]);

export class ConfigValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function requireNonBlank(env, name) {
  if (isBlank(env[name])) {
    throw new ConfigValidationError(`Invalid configuration: "${name}" is required and must not be empty.`);
  }

  return env[name].trim();
}

function requirePortNumber(env, name) {
  const raw = requireNonBlank(env, name);

  if (!/^\d+$/.test(raw)) {
    throw new ConfigValidationError(`Invalid configuration: "${name}" must be an integer.`);
  }

  const value = Number.parseInt(raw, 10);

  if (value < MIN_PORT || value > MAX_PORT) {
    throw new ConfigValidationError(`Invalid configuration: "${name}" must be between ${MIN_PORT} and ${MAX_PORT}.`);
  }

  return value;
}

export function validateEnv(env) {
  for (const name of REQUIRED_APP_VARS) {
    requireNonBlank(env, name);
  }

  const nodeEnv = requireNonBlank(env, 'NODE_ENV');

  if (!ALLOWED_NODE_ENVS.includes(nodeEnv)) {
    throw new ConfigValidationError(`Invalid configuration: "NODE_ENV" must be one of ${ALLOWED_NODE_ENVS.join(', ')}.`);
  }

  const host = requireNonBlank(env, 'HOST');

  if (nodeEnv === 'development' && host !== '127.0.0.1') {
    throw new ConfigValidationError('Invalid configuration: "HOST" must be "127.0.0.1" when NODE_ENV is "development".');
  }

  const port = requirePortNumber(env, 'PORT');
  const databaseUrl = isBlank(env.DATABASE_URL) ? null : env.DATABASE_URL.trim();

  if (databaseUrl) {
    return Object.freeze({
      app: Object.freeze({
        nodeEnv,
        host,
        port,
      }),
      database: Object.freeze({
        connectionString: databaseUrl,
      }),
    });
  }

  for (const name of REQUIRED_DB_VARS) {
    requireNonBlank(env, name);
  }

  const dbHost = requireNonBlank(env, 'DB_HOST');
  const dbPort = requirePortNumber(env, 'DB_PORT');
  const dbName = requireNonBlank(env, 'DB_NAME');
  const dbUser = requireNonBlank(env, 'DB_USER');
  const dbPassword = requireNonBlank(env, 'DB_PASSWORD');

  return Object.freeze({
    app: Object.freeze({
      nodeEnv,
      host,
      port,
    }),
    database: Object.freeze({
      host: dbHost,
      port: dbPort,
      name: dbName,
      user: dbUser,
      password: dbPassword,
    }),
  });
}

function loadConfig() {
  const result = loadEnv({ path: ENV_PATH });

  if (result.error) {
    throw new ConfigValidationError(`Invalid configuration: failed to load environment file at "${ENV_PATH}".`);
  }

  return validateEnv(process.env);
}

const config = loadConfig();

export default config;
