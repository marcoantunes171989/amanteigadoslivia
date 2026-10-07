// Identificação do ambiente exibida no Painel Administrativo.
// Fonte única: variável APP_AMBIENTE (opcional, definida por ambiente de execução).
// Ausente ou fora da lista => UNKNOWN. Ambiente desconhecido nunca vira PROD.
export const AMBIENTE = Object.freeze({
  DEV: 'DEV',
  HML: 'HML',
  PROD: 'PROD',
  UNKNOWN: 'UNKNOWN',
});

const VALORES_APP_AMBIENTE = Object.freeze({
  development: AMBIENTE.DEV,
  local: AMBIENTE.DEV,
  homolog: AMBIENTE.HML,
  homologacao: AMBIENTE.HML,
  staging: AMBIENTE.HML,
  production: AMBIENTE.PROD,
});

export function resolveAmbiente(env = process.env) {
  const raw = typeof env?.APP_AMBIENTE === 'string' ? env.APP_AMBIENTE.trim().toLowerCase() : '';
  return Object.hasOwn(VALORES_APP_AMBIENTE, raw) ? VALORES_APP_AMBIENTE[raw] : AMBIENTE.UNKNOWN;
}
