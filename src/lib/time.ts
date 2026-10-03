export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "just now", "4m ago", "2h ago", "3d ago", "5mo ago", "2y ago" */
export function ago(input: string | number | Date, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(input).getTime()) / 1000;
  if (diff < 45) return 'just now';
  const steps: [number, string][] = [
    [60, 's'],
    [60, 'm'],
    [24, 'h'],
    [30, 'd'],
    [12, 'mo'],
    [Infinity, 'y'],
  ];
  let value = diff;
  for (let i = 0; i < steps.length; i++) {
    const [size, unit] = steps[i];
    if (value < size) return `${Math.floor(value)}${unit} ago`;
    value /= size;
  }
  return 'a while ago';
}

/** Minutes between the visitor's offset and a zone's offset, at this instant. */
export function zoneOffsetMinutes(timeZone: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const minute = Math.floor(at.getTime() / 60000) * 60000;
  return Math.round((asUTC - minute) / 60000);
}

export function relativeZone(timeZone: string): string {
  const mine = -new Date().getTimezoneOffset();
  const diff = zoneOffsetMinutes(timeZone) - mine;
  if (Math.abs(diff) < 1) return 'same time as you';
  const hours = Math.abs(diff) / 60;
  const label = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  return `${label} ${diff > 0 ? 'ahead of' : 'behind'} you`;
}

export const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact' }).format(n);
