export type Direction = 'left' | 'right';

export type WegweiserData = {
  farDestination: string;
  farDistance: string;
  nearDestination: string;
  nearDistance: string;
  direction: Direction;
};

export type WegweiserLine = {
  destination: string;
  distance: string;
};

export type WegweiserValidation = {
  form?: string;
  farDistance?: string;
  nearDistance?: string;
};

export const defaultWegweiserData: WegweiserData = {
  farDestination: 'Zentrum',
  farDistance: '1,0',
  nearDestination: 'Bahnhof',
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

export function getVisibleLines(data: WegweiserData): WegweiserLine[] {
  return [
    { destination: data.farDestination.trim(), distance: data.farDistance.trim() },
    { destination: data.nearDestination.trim(), distance: data.nearDistance.trim() }
  ].filter((line) => line.destination || line.distance);
}

function validateLine(destination: string, distance: string): string | undefined {
  if (!destination.trim() && distance.trim()) {
    return 'Entfernung nur mit Zielzeile eintragen.';
  }

  if (destination.trim() && parseDistance(distance) === null) {
    return 'Entfernung muss numerisch sein.';
  }

  return undefined;
}

export function validateWegweiser(data: WegweiserData): WegweiserValidation {
  const errors: WegweiserValidation = {};

  if (!data.farDestination.trim() && !data.nearDestination.trim()) {
    errors.form = 'Mindestens eine Zielzeile muss befüllt sein.';
  }

  const farDistanceError = validateLine(data.farDestination, data.farDistance);
  const nearDistanceError = validateLine(data.nearDestination, data.nearDistance);

  if (farDistanceError) {
    errors.farDistance = farDistanceError;
  }

  if (nearDistanceError) {
    errors.nearDistance = nearDistanceError;
  }

  return errors;
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getSignGeometry(direction: Direction) {
  const isRight = direction === 'right';

  return {
    signPath: isRight ? 'M36 28H872L972 125L872 222H36Z' : 'M964 28H128L28 125L128 222H964Z',
    arrowFillPath: isRight ? 'M872 28L972 125L872 222Z' : 'M128 28L28 125L128 222Z',
    arrowDividerX: isRight ? 872 : 128,
    contentStartX: isRight ? 78 : 170,
    distanceEndX: isRight ? 820 : 920,
    targetAreaEndX: isRight ? 640 : 740,
    distanceAreaStartX: isRight ? 660 : 760,
    arrowLabelX: isRight ? 922 : 78
  };
}

export function getLineYPositions(lineCount: number): number[] {
  if (lineCount <= 1) {
    return [134];
  }

  return [96, 168];
}

export function buildWegweiserSvg(data: WegweiserData): string {
  const geometry = getSignGeometry(data.direction);
  const lines = getVisibleLines(data).filter((line) => line.destination);
  const yPositions = getLineYPositions(lines.length);
  const textLines = lines
    .map((line, index) => {
      const y = yPositions[index] ?? yPositions[yPositions.length - 1];
      return `  <text x="${geometry.contentStartX}" y="${y}" class="target-text">${escapeSvgText(line.destination)}</text>\n  <text x="${geometry.distanceEndX}" y="${y}" class="distance-text">${escapeSvgText(formatDistance(line.distance))}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 250" role="img" aria-labelledby="sign-title sign-description">
  <title id="sign-title">HBR-Pfeilwegweiser</title>
  <desc id="sign-description">Pfeilwegweiser ${data.direction === 'right' ? 'rechtsweisend' : 'linksweisend'}</desc>
  <style>
    .sign-outline{fill:#fff;stroke:#8f8f8f;stroke-width:4;stroke-linejoin:round}
    .arrow{fill:#d7001f}
    .divider,.area-divider{stroke:#c8c8c8;stroke-width:3}
    .area-divider{stroke-dasharray:10 8;opacity:.65}
    .target-text,.distance-text{fill:#d7001f;font-family:Arial,Helvetica,sans-serif;font-size:58px;font-weight:500;dominant-baseline:middle}
    .distance-text{text-anchor:end}
  </style>
  <rect width="1000" height="250" fill="#f8fafc"/>
  <path class="sign-outline" d="${geometry.signPath}"/>
  <path class="arrow" d="${geometry.arrowFillPath}"/>
  <line class="divider" x1="${geometry.arrowDividerX}" x2="${geometry.arrowDividerX}" y1="32" y2="218"/>
  <line class="area-divider" x1="${geometry.targetAreaEndX}" x2="${geometry.targetAreaEndX}" y1="48" y2="202"/>
  <line class="area-divider" x1="${geometry.distanceAreaStartX}" x2="${geometry.distanceAreaStartX}" y1="48" y2="202"/>
${textLines}
</svg>`;
}
