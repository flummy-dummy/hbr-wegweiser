export type Direction = 'left' | 'right';
export type DestinationPictogram = 'none' | string;
export type RouteOption = string;
export type SelectOption = {
  value: string;
  label: string;
};
export type WegweiserOption = SelectOption & {
  slug?: string;
  kurzlabel?: string;
  kategorie?: string;
  imageUrl?: string;
};
export type WegweiserAssets = {
  pictogramOptions: WegweiserOption[];
  routeOptions: WegweiserOption[];
};

export type WegweiserData = {
  farDestination: string;
  farDistance: string;
  farPictograms: DestinationPictogram[];
  farRoutePictograms: DestinationPictogram[];
  nearDestination: string;
  nearDistance: string;
  nearPictograms: DestinationPictogram[];
  nearRoutePictograms: DestinationPictogram[];
  direction: Direction;
  routes: RouteOption[];
};

export type WegweiserLine = {
  destination: string;
  distance: string;
  pictograms: DestinationPictogram[];
  routePictograms: DestinationPictogram[];
};

export type WegweiserRow = WegweiserLine & {
  key: 'far' | 'near';
  y: number;
  hasDestination: boolean;
};

export type WegweiserValidation = {
  form?: string;
  farDistance?: string;
  nearDistance?: string;
};

export const wegweiserLayout = {
  ansichtBreite: 1000,
  ansichtHoehe: 330,
  schildBreite: 936,
  schildHoehe: 194,
  schildLinks: 36,
  schildOben: 28,
  schildMitteY: 125,
  pfeilBreite: 100,
  piktogrammSpalteBreite: 104,
  textBereichBreite: 472,
  entfernungBereichBreite: 160,
  innenabstand: 40,
  spaltenAbstand: 20,
  piktogrammGroesse: 56,
  zeilenPiktogrammGroesse: 44,
  zeilenPiktogrammAbstand: 8,
  textSchriftGroesse: 58,
  linienY: {
    oben: 88,
    unten: 162,
    einzeln: 125
  },
  einschubQuadratGroesse: 74,
  einschubAbstand: 8,
  einschubY: 238,
  einschubSchriftGroesse: 11,
  einschubKleineSchriftGroesse: 9
} as const;

export const pictogramOptions: WegweiserOption[] = [
  { value: 'none', label: 'kein Piktogramm' },
  { value: 'station', label: 'Bahnhof', kategorie: 'ziel' },
  { value: 'center', label: 'Zentrum', kategorie: 'ziel' },
  { value: 'ferry', label: 'Fähre', kategorie: 'ziel' }
];

export const routeOptions: WegweiserOption[] = [
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
  farPictograms: [],
  farRoutePictograms: [],
  nearDestination: 'Bahnhof',
  nearDistance: '5,6',
  nearPictograms: [],
  nearRoutePictograms: [],
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

export function findPictogramOption(
  pictogram: DestinationPictogram,
  options: WegweiserOption[] = pictogramOptions
): WegweiserOption | undefined {
  return options.find((option) => option.value === pictogram);
}

export function findRouteOption(
  route: RouteOption,
  options: WegweiserOption[] = routeOptions
): WegweiserOption | undefined {
  return options.find((option) => option.value === route);
}

export function getVisibleLines(data: WegweiserData): WegweiserLine[] {
  return [
    {
      destination: data.farDestination.trim(),
      distance: data.farDistance.trim(),
      pictograms: data.farPictograms.slice(0, 2),
      routePictograms: data.farRoutePictograms.slice(0, 2)
    },
    {
      destination: data.nearDestination.trim(),
      distance: data.nearDistance.trim(),
      pictograms: data.nearPictograms.slice(0, 2),
      routePictograms: data.nearRoutePictograms.slice(0, 2)
    }
  ].filter((line) => line.destination || line.distance);
}

export function getWegweiserRows(data: WegweiserData): WegweiserRow[] {
  const rows: WegweiserRow[] = [
    {
      key: 'far',
      destination: data.farDestination.trim(),
      distance: data.farDistance.trim(),
      pictograms: data.farPictograms.slice(0, 2),
      routePictograms: data.farRoutePictograms.slice(0, 2),
      y: wegweiserLayout.linienY.oben,
      hasDestination: Boolean(data.farDestination.trim())
    },
    {
      key: 'near',
      destination: data.nearDestination.trim(),
      distance: data.nearDistance.trim(),
      pictograms: data.nearPictograms.slice(0, 2),
      routePictograms: data.nearRoutePictograms.slice(0, 2),
      y: wegweiserLayout.linienY.unten,
      hasDestination: Boolean(data.nearDestination.trim())
    }
  ];
  const populatedRows = rows.filter((row) => row.destination || row.distance);

  if (populatedRows.length === 1 && rows[0].hasDestination && !rows[1].hasDestination) {
    return [{ ...rows[0], y: wegweiserLayout.linienY.einzeln }];
  }

  return populatedRows;
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

function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value).replaceAll("'", '&apos;');
}

export function getSignGeometry(direction: Direction) {
  const isRight = direction === 'right';
  const layout = wegweiserLayout;
  const signRight = layout.schildLinks + layout.schildBreite;
  const signBottom = layout.schildOben + layout.schildHoehe;
  const rightArrowBaseX = signRight - layout.pfeilBreite;
  const leftArrowBaseX = layout.schildLinks + layout.pfeilBreite;
  const bodyStartX = isRight ? layout.schildLinks : leftArrowBaseX;
  const bodyEndX = isRight ? rightArrowBaseX : signRight;
  const textStartX = bodyStartX + layout.innenabstand;
  const contentStartX = textStartX + layout.piktogrammSpalteBreite;
  const targetAreaEndX = contentStartX + layout.textBereichBreite;
  const distanceAreaStartX = targetAreaEndX + layout.spaltenAbstand;
  const distanceEndX = distanceAreaStartX + layout.entfernungBereichBreite;
  const iconAreaEndX = bodyStartX + layout.innenabstand + layout.piktogrammSpalteBreite - layout.spaltenAbstand;

  return {
    signPath: isRight
      ? `M${layout.schildLinks} ${layout.schildOben}H${rightArrowBaseX}L${signRight} ${layout.schildMitteY}L${rightArrowBaseX} ${signBottom}H${layout.schildLinks}Z`
      : `M${signRight} ${layout.schildOben}H${leftArrowBaseX}L${layout.schildLinks - 8} ${layout.schildMitteY}L${leftArrowBaseX} ${signBottom}H${signRight}Z`,
    arrowFillPath: isRight
      ? `M${rightArrowBaseX} ${layout.schildOben}L${signRight} ${layout.schildMitteY}L${rightArrowBaseX} ${signBottom}Z`
      : `M${leftArrowBaseX} ${layout.schildOben}L${layout.schildLinks - 8} ${layout.schildMitteY}L${leftArrowBaseX} ${signBottom}Z`,
    arrowDividerX: isRight ? rightArrowBaseX : leftArrowBaseX,
    iconX: bodyStartX + layout.innenabstand,
    iconSize: layout.piktogrammGroesse,
    lineIconSize: layout.zeilenPiktogrammGroesse,
    lineIconGap: layout.zeilenPiktogrammAbstand,
    textStartX,
    contentStartX,
    distanceEndX,
    iconAreaEndX,
    targetAreaEndX,
    distanceAreaStartX,
    routeAnchorX: isRight ? rightArrowBaseX : leftArrowBaseX,
    routeDirection: isRight ? -1 : 1,
    routeSize: layout.einschubQuadratGroesse,
    routeGap: layout.einschubAbstand,
    routeY: layout.einschubY,
    guideY1: layout.schildOben + 20,
    guideY2: signBottom - 20,
    dividerY1: layout.schildOben + 4,
    dividerY2: signBottom - 4,
    targetTextWidth: layout.textBereichBreite,
    distanceTextWidth: layout.entfernungBereichBreite
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
  size: number,
  option?: WegweiserOption
): string {
  if (pictogram === 'none') {
    return '';
  }

  const iconY = y - size / 2;
  const centerX = x + size / 2;
  const centerY = y;
  const imagePadding = 6;
  if (option?.imageUrl) {
    return `<g class="pictogram">
    <rect x="${x}" y="${iconY}" width="${size}" height="${size}" rx="3"/>
    <image href="${escapeSvgAttribute(option.imageUrl)}" x="${x + imagePadding}" y="${iconY + imagePadding}" width="${size - imagePadding * 2}" height="${size - imagePadding * 2}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
  }

  const label =
    pictogram === 'station'
      ? 'Bf'
      : pictogram === 'center'
        ? 'Z'
        : pictogram === 'ferry'
          ? 'F'
          : option?.kurzlabel ?? option?.label.slice(0, 3) ?? '';
  const extra = pictogram === 'ferry'
    ? `<path class="picto-line" d="M${x + 10} ${centerY + 12}h36l-7 9H${x + 17}z"/>`
    : pictogram === 'station'
      ? `<path class="picto-line" d="M${x + 11} ${centerY + 13}h34M${x + 17} ${centerY + 19}h22"/>`
      : pictogram === 'center'
        ? `<circle class="picto-line" cx="${centerX}" cy="${centerY}" r="13"/>`
        : '';

  return `<g class="pictogram">
    <rect x="${x}" y="${iconY}" width="${size}" height="${size}" rx="3"/>
    <text x="${centerX}" y="${centerY}">${escapeSvgText(label)}</text>
    ${extra}
  </g>`;
}

function getLinePictogramsMarkup(
  pictograms: DestinationPictogram[],
  options: WegweiserOption[] | undefined,
  x: number,
  y: number
): string {
  const size = wegweiserLayout.zeilenPiktogrammGroesse;
  const gap = wegweiserLayout.zeilenPiktogrammAbstand;

  return pictograms
    .slice(0, 2)
    .map((pictogram, index) =>
      getPictogramMarkup(
        pictogram,
        x + index * (size + gap),
        y,
        size,
        findPictogramOption(pictogram, options)
      )
    )
    .join('\n');
}

export function getRouteTextLines(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [''];
  }

  if (label.length <= 10 || words.length === 1) {
    return [label];
  }

  const middle = label.length / 2;
  let breakIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let firstLine = '';

  for (let index = 1; index < words.length; index += 1) {
    firstLine = words.slice(0, index).join(' ');
    const distance = Math.abs(firstLine.length - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      breakIndex = index;
    }
  }

  const lines = [words.slice(0, breakIndex).join(' '), words.slice(breakIndex).join(' ')];
  return lines.filter(Boolean).slice(0, 2);
}

export function getRouteFontSize(label: string): number {
  const longestLine = Math.max(...getRouteTextLines(label).map((line) => line.length));

  return longestLine > 11 ? wegweiserLayout.einschubKleineSchriftGroesse : wegweiserLayout.einschubSchriftGroesse;
}

function getRouteMarkup(data: WegweiserData, options: WegweiserOption[] = routeOptions): string {
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
      const option = findRouteOption(route, options);
      const label = option?.kurzlabel ?? option?.label ?? getRouteLabel(route);
      const imagePadding = 6;
      if (option?.imageUrl) {
        return `<g class="route-item">
    <rect x="${x}" y="${geometry.routeY}" width="${geometry.routeSize}" height="${geometry.routeSize}" rx="2"/>
    <image href="${escapeSvgAttribute(option.imageUrl)}" x="${x + imagePadding}" y="${geometry.routeY + imagePadding}" width="${geometry.routeSize - imagePadding * 2}" height="${geometry.routeSize - imagePadding * 2}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
      }
      const lines = getRouteTextLines(label);
      const fontSize = getRouteFontSize(label);
      const lineHeight = fontSize + 2;
      const textY = geometry.routeY + geometry.routeSize / 2 - ((lines.length - 1) * lineHeight) / 2;
      const tspans = lines
        .map((line, lineIndex) =>
          `<tspan x="${x + geometry.routeSize / 2}" ${lineIndex === 0 ? `y="${textY}"` : `dy="${lineHeight}"`}>${escapeSvgText(line)}</tspan>`
        )
        .join('');
      return `<g class="route-item">
    <rect x="${x}" y="${geometry.routeY}" width="${geometry.routeSize}" height="${geometry.routeSize}" rx="2"/>
    <text font-size="${fontSize}">${tspans}</text>
  </g>`;
    })
    .join('\n');
}

export function buildWegweiserSvg(data: WegweiserData, assets?: WegweiserAssets): string {
  const geometry = getSignGeometry(data.direction);
  const rows = getWegweiserRows(data).filter((row) => row.hasDestination);
  const textLines = rows
    .map((line) => {
      const y = line.y;
      const targetTextX = line.pictograms.length ? geometry.contentStartX : geometry.textStartX;
      const routePictogramSize = geometry.lineIconSize;
      const routePictogramGap = geometry.lineIconGap;
      const routePictogramStartX =
        geometry.distanceAreaStartX -
        line.routePictograms.length * routePictogramSize -
        Math.max(0, line.routePictograms.length - 1) * routePictogramGap -
        routePictogramGap;

      return `${getLinePictogramsMarkup(line.pictograms, assets?.pictogramOptions, geometry.iconX, y)}
  <text x="${targetTextX}" y="${y}" class="target-text">${escapeSvgText(line.destination)}</text>
  ${getLinePictogramsMarkup(line.routePictograms, assets?.pictogramOptions, routePictogramStartX, y)}
  <text x="${geometry.distanceEndX}" y="${y}" class="distance-text">${escapeSvgText(formatDistance(line.distance))}</text>`;
    })
    .join('\n');
  const routeMarkup = getRouteMarkup(data, assets?.routeOptions);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 330" role="img" aria-labelledby="sign-title sign-description">
  <title id="sign-title">HBR-Pfeilwegweiser</title>
  <desc id="sign-description">Pfeilwegweiser ${data.direction === 'right' ? 'rechtsweisend' : 'linksweisend'}</desc>
  <style>
    .sign-outline{fill:#fff;stroke:#d7001f;stroke-width:4;stroke-linejoin:round}
    .arrow{fill:#d7001f}
    .divider{stroke:#d7001f;stroke-width:3}
    .area-divider{stroke:#c8c8c8;stroke-width:3;stroke-dasharray:10 8;opacity:.6}
    .target-text,.distance-text{fill:#d7001f;font-family:Arial,Helvetica,sans-serif;font-size:${wegweiserLayout.textSchriftGroesse}px;font-weight:500;dominant-baseline:middle}
    .distance-text{text-anchor:end}
    .pictogram rect{fill:#fff;stroke:#d7001f;stroke-width:2}.pictogram text{fill:#d7001f;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;text-anchor:middle;dominant-baseline:middle}.picto-line{fill:none;stroke:#d7001f;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .route-item rect{fill:#fff;stroke:#2f4778;stroke-width:2}.route-item text{fill:#1f2a44;font-family:Arial,Helvetica,sans-serif;font-weight:700;text-anchor:middle;dominant-baseline:middle}
  </style>
  <rect width="${wegweiserLayout.ansichtBreite}" height="${wegweiserLayout.ansichtHoehe}" fill="#f8fafc"/>
  <path class="sign-outline" d="${geometry.signPath}"/>
  <path class="arrow" d="${geometry.arrowFillPath}"/>
  <line class="divider" x1="${geometry.arrowDividerX}" x2="${geometry.arrowDividerX}" y1="${geometry.dividerY1}" y2="${geometry.dividerY2}"/>
  <line class="area-divider" x1="${geometry.iconAreaEndX}" x2="${geometry.iconAreaEndX}" y1="${geometry.guideY1}" y2="${geometry.guideY2}"/>
  <line class="area-divider" x1="${geometry.targetAreaEndX}" x2="${geometry.targetAreaEndX}" y1="${geometry.guideY1}" y2="${geometry.guideY2}"/>
  <line class="area-divider" x1="${geometry.distanceAreaStartX}" x2="${geometry.distanceAreaStartX}" y1="${geometry.guideY1}" y2="${geometry.guideY2}"/>
${textLines}
${routeMarkup}
</svg>`;
}
