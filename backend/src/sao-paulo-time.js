// Dia civil de São Paulo, independente do timezone do processo/servidor.
// Única fonte semântica do fuso para relatórios administrativos: America/Sao_Paulo.

const SAO_PAULO_TZ = 'America/Sao_Paulo';
const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: SAO_PAULO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const wallClockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// AAAA-MM-DD do dia civil de São Paulo para um instante.
export function saoPauloDayKey(date) {
  return dayKeyFormat.format(date);
}

// Data civil AAAA-MM-DD válida (rejeita 31/02 e similares).
export function isCivilDateKey(value) {
  if (typeof value !== 'string' || !CIVIL_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Soma dias a uma data civil AAAA-MM-DD sem depender de fuso.
export function addCivilDays(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Deslocamento de São Paulo (ms) naquele instante: relógio de parede em SP menos UTC.
function saoPauloOffsetMs(instant) {
  const parts = {};
  for (const part of wallClockFormat.formatToParts(instant)) parts[part.type] = part.value;
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  const wholeSecond = Math.floor(instant.getTime() / 1000) * 1000;
  return wallAsUtc - wholeSecond;
}

// Instante UTC correspondente a um horário de parede (ano/mês/dia/hora/minuto)
// em São Paulo. Duas passadas: o offset é lido no instante estimado, que pode
// cair do outro lado de uma transição de horário.
function saoPauloWallInstant(year, month, day, hour = 0, minute = 0) {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = wallAsUtc - saoPauloOffsetMs(new Date(wallAsUtc));
  return new Date(wallAsUtc - saoPauloOffsetMs(new Date(first)));
}

// Instante de 00:00:00.000 do dia civil AAAA-MM-DD em São Paulo.
export function saoPauloDayStart(key) {
  const [year, month, day] = key.split('-').map(Number);
  return saoPauloWallInstant(year, month, day);
}

// Instante UTC de uma data civil AAAA-MM-DD + hora HH:MM (sem segundos) em São
// Paulo. Usado para agendamentos: nunca assume um offset fixo (-03:00), pois o
// deslocamento é recalculado a partir do relógio de parede real na data informada.
export function saoPauloCivilDateTime(dateKey, hora) {
  if (!isCivilDateKey(dateKey)) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(String(hora || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  return saoPauloWallInstant(year, month, day, hour, minute);
}

// Limite inicial de um intervalo informado pelo chamador.
// AAAA-MM-DD: início do dia civil de São Paulo. Timestamp ISO completo: preserva o instante.
export function startOfBoundary(value) {
  if (isCivilDateKey(value)) return saoPauloDayStart(value);
  return new Date(value);
}

// Limite final EXCLUSIVO de um intervalo informado pelo chamador.
// AAAA-MM-DD: início do dia seguinte em São Paulo (o dia inteiro fica dentro).
// Timestamp ISO: o instante + 1 ms, para manter a inclusão do instante informado.
export function endExclusiveOfBoundary(value) {
  if (isCivilDateKey(value)) return saoPauloDayStart(addCivilDays(value, 1));
  return new Date(new Date(value).getTime() + 1);
}
