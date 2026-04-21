export type Direction = 'left' | 'right';
export type DestinationPictogram = 'none' | 'station' | 'center' | 'ferry';
export type RouteOption =
  | 'castle-route'
  | 'radbahn'
  | 'theme-route'
  | 'water-route'
  | 'heritage-route'
  | 'park-route';

export type WegweiserData = {
  farDestination: string;
  farDistance: string;
  farPictogram: DestinationPictogram;
  nearDestination: string;
  nearDistance: string;
  nearPictogram: DestinationPictogram;
  direction: Direction;
  routes: RouteOption[];
};

export type WegweiserLine = {
  destination: string;
  distance: string;
  pictogram: DestinationPictogram;
};

export type WegweiserValidation = {
  form?: string;
  farDistance?: string;
  nearDistance?: string;
};

export const pictogramOptions: Array<{ value: DestinationPictogram; label: string }> = [
  { value: 'none', label: 'kein Piktogramm' },
  { value: 'station', label: 'Bahnhof' },
  { value: 'center', label: 'Zentrum' },
  { value: 'ferry', label: 'Fähre' }
];

export const routeOptions: Array<{ value: RouteOption; label: string }> = [
  { value: 'castle-route', label: '100 Schlösser Route' },
  { value: 'radbahn', label: 'Radbahn' },
  { value: 'theme-route', label: 'Themenroute' },
  { value: 'water-route', label: 'Wasserroute' },
  { value: 'heritage-route', label: 'Kulturradweg' },
  { value: 'park-route', label: 'Parkroute' }
];

export const defaultWegweiserData: WegweiserData = {
  farDestination: 'Zentrum',
  farDistance: '1,0',
  farPictogram: 'center',
  nearDestination: 'Bahnhof',
  nearDistance: '5,6',
  nearPictogram: 'station',
  direction: 'right',
  routes: ['castle-route', 'radbahn']
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

export function getRouteLabel(route: RouteOption): string {
  return routeOptions.find((option) => option.value === route)?.label ?? route;
}

export function getVisibleLines(data: WegweiserData): WegweiserLine[] {
  return [
    {
      destination: data.farDestination.trim(),
      distance: data.farDistance.trim(),
      pictogram: data.farPictogram
    },
    {
      destination: data.nearDestination.trim(),
      distance: data.nearDistance.trim(),
      pictogram: data.nearPictogram
    }
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
    iconX: isRight ? 76 : 168,
    iconSize: 56,
    contentStartX: isRight ? 158 : 250,
    distanceEndX: isRight ? 820 : 920,
    iconAreaEndX: isRight ? 142 : 234,
    targetAreaEndX: isRight ? 640 : 740,
    distanceAreaStartX: isRight ? 660 : 760,
    routeAnchorX: isRight ? 872 : 128,
    routeDirection: isRight ? -1 : 1,
    routeSize: 74,
    routeGap: 8,
    routeY: 238
  };
}

export function getLineYPositions(lineCount: number): number[] {
  if (lineCount <= 1) {
    return [125];
  }

  return [88, 162];
}

function getPictogramMarkup(
  pictogram: DestinationPictogram,
  x: number,
  y: number,
  size: number
): string {
  if (pictogram === 'none') {
    return '';
  }

  const iconY = y - size / 2;
  const centerX = x + size / 2;
  const centerY = y;
  const label = pictogram === 'station' ? 'Bf' : pictogram === 'center' ? 'Z' : 'F';
  const extra = pictogram === 'ferry'
    ? `<path class="picto-line" d="M${x + 10} ${centerY + 12}h36l-7 9H${x + 17}z"/>`
    : pictogram === 'station'
      ? `<path class="picto-line" d="M${x + 11} ${centerY + 13}h34M${x + 17} ${centerY + 19}h22"/>`
      : `<circle class="picto-line" cx="${centerX}" cy="${centerY}" r="13"/>`;

  return `<g class="pictogram">
    <rect x="${x}" y="${iconY}" width="${size}" height="${size}" rx="3"/>
    <text x="${centerX}" y="${centerY}">${label}</text>
    ${extra}
  </g>`;
}

function getRouteMarkup(data: WegweiserData): string {
  const geometry = getSignGeometry(data.direction);
  const routes = data.routes.slice(0, 6);
  if (!routes.length) {
    return '';
  }

  return routes
    .map((route, index) => {
      const step = index * (geometry.routeSize + geometry.routeGap);
      const x = geometry.routeDirection === -1
        ? geometry.routeAnchorX - geometry.routeSize - step
        : geometry.routeAnchorX + step;
      return `<g class="route-item">
    <rect x="${x}" y="${geometry.routeY}" width="${geometry.routeSize}" height="${geometry.routeSize}" rx="2"/>
    <text x="${x + geometry.routeSize / 2}" y="${geometry.routeY + geometry.routeSize / 2}">${escapeSvgText(getRouteLabel(route))}</text>
  </g>`;
    })
    .join('\n');
}

export function buildWegweiserSvg(data: WegweiserData): string {
  const geometry = getSignGeometry(data.direction);
  const lines = getVisibleLines(data).filter((line) => line.destination);
  const yPositions = getLineYPositions(lines.length);
  const textLines = lines
    .map((line, index) => {
      const y = yPositions[index] ?? yPositions[yPositions.length - 1];
      return `${getPictogramMarkup(line.pictogram, geometry.iconX, y, geometry.iconSize)}
  <text x="${geometry.contentStartX}" y="${y}" class="target-text">${escapeSvgText(line.destination)}</text>
  <text x="${geometry.distanceEndX}" y="${y}" class="distance-text">${escapeSvgText(formatDistance(line.distance))}</text>`;
    })
    .join('\n');
  const routeMarkup = getRouteMarkup(data);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 330" role="img" aria-labelledby="sign-title sign-description">
  <title id="sign-title">HBR-Pfeilwegweiser</title>
  <desc id="sign-description">Pfeilwegweiser ${data.direction === 'right' ? 'rechtsweisend' : 'linksweisend'}</desc>
  <style>
    .sign-outline{fill:#fff;stroke:#d7001f;stroke-width:4;stroke-linejoin:round}
    .arrow{fill:#d7001f}
    .divider{stroke:#d7001f;stroke-width:3}
    .area-divider{stroke:#c8c8c8;stroke-width:3;stroke-dasharray:10 8;opacity:.6}
    .target-text,.distance-text{fill:#d7001f;font-family:Arial,Helvetica,sans-serif;font-size:58px;font-weight:500;dominant-baseline:middle}
    .distance-text{text-anchor:end}
    .pictogram rect{fill:#fff;stroke:#d7001f;stroke-width:2}.pictogram text{fill:#d7001f;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;text-anchor:middle;dominant-baseline:middle}.picto-line{fill:none;stroke:#d7001f;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .route-item rect{fill:#fff;stroke:#2f4778;stroke-width:2}.route-item text{fill:#1f2a44;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;text-anchor:middle;dominant-baseline:middle}
  </style>
  <rect width="1000" height="330" fill="#f8fafc"/>
  <path class="sign-outline" d="${geometry.signPath}"/>
  <path class="arrow" d="${geometry.arrowFillPath}"/>
  <line class="divider" x1="${geometry.arrowDividerX}" x2="${geometry.arrowDividerX}" y1="32" y2="218"/>
  <line class="area-divider" x1="${geometry.iconAreaEndX}" x2="${geometry.iconAreaEndX}" y1="48" y2="202"/>
  <line class="area-divider" x1="${geometry.targetAreaEndX}" x2="${geometry.targetAreaEndX}" y1="48" y2="202"/>
  <line class="area-divider" x1="${geometry.distanceAreaStartX}" x2="${geometry.distanceAreaStartX}" y1="48" y2="202"/>
${textLines}
${routeMarkup}
</svg>`;
}
