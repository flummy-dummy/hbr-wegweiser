const HIMMELSRICHTUNGEN = [
  'Norden',
  'Nordosten',
  'Osten',
  'Südosten',
  'Süden',
  'Südwesten',
  'Westen',
  'Nordwesten'
] as const;

export function normalizeHimmelsrichtungGrad(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : 0;

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  const normalized = ((Math.trunc(parsed) % 360) + 360) % 360;
  return normalized;
}

export function gradZuHimmelsrichtung(value: unknown): string {
  const grad = normalizeHimmelsrichtungGrad(value);
  const sector = Math.floor(((grad + 22.5) % 360) / 45);
  return HIMMELSRICHTUNGEN[sector] ?? 'Norden';
}

export function himmelsrichtungZuGrad(value: string): number | null {
  const normalized = value.trim().toLowerCase();

  const matchIndex = HIMMELSRICHTUNGEN.findIndex((entry) => entry.toLowerCase() === normalized);

  return matchIndex >= 0 ? matchIndex * 45 : null;
}
