export type Direction = 'left' | 'right';

export type WegweiserData = {
  farDestination: string;
  farDistance: string;
  nearDestination: string;
  nearDistance: string;
  direction: Direction;
};

export type WegweiserValidation = {
  farDestination?: string;
  farDistance?: string;
  nearDistance?: string;
};

export const defaultWegweiserData: WegweiserData = {
  farDestination: 'Fernziel',
  farDistance: '1,0',
  nearDestination: 'Nahziel',
  nearDistance: '5,6',
  direction: 'right'
};

export function parseDistance(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function formatDistance(value: string): string {
  const parsed = parseDistance(value);
  if (parsed === null) {
    return value;
  }

  if (parsed < 10) {
    return parsed.toFixed(1).replace('.', ',');
  }

  return Math.round(parsed).toString();
}

export function validateWegweiser(data: WegweiserData): WegweiserValidation {
  const errors: WegweiserValidation = {};

  if (!data.farDestination.trim()) {
    errors.farDestination = 'Fernziel darf nicht leer sein.';
  }

  if (parseDistance(data.farDistance) === null) {
    errors.farDistance = 'Entfernung muss numerisch sein.';
  }

  if (parseDistance(data.nearDistance) === null) {
    errors.nearDistance = 'Entfernung muss numerisch sein.';
  }

  return errors;
}
