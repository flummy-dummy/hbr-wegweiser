<script lang="ts">
  import type { DestinationPictogram, WegweiserData } from '$lib/wegweiser';
  import {
    formatDistance,
    getRouteLabel,
    getRouteFontSize,
    getRouteTextLines,
    getSignGeometry,
    getWegweiserRows,
    wegweiserLayout
  } from '$lib/wegweiser';

  let { data }: { data: WegweiserData } = $props();

  const geometry = $derived(getSignGeometry(data.direction));
  const visibleLines = $derived(getWegweiserRows(data).filter((line) => line.hasDestination));
  const routes = $derived(data.routes.slice(0, 6));

  function routeX(index: number) {
    const step = index * (geometry.routeSize + geometry.routeGap);

    return geometry.routeDirection === -1
      ? geometry.routeAnchorX - geometry.routeSize - step
      : geometry.routeAnchorX + step;
  }

  function routeTextY(label: string) {
    const lines = getRouteTextLines(label);
    const lineHeight = getRouteFontSize(label) + 2;

    return geometry.routeY + geometry.routeSize / 2 - ((lines.length - 1) * lineHeight) / 2;
  }

  function pictogramLabel(pictogram: DestinationPictogram) {
    if (pictogram === 'station') return 'Bf';
    if (pictogram === 'center') return 'Z';
    if (pictogram === 'ferry') return 'F';
    return '';
  }
</script>

<svg
  role="img"
  aria-labelledby="sign-title sign-description"
  viewBox={`0 0 ${wegweiserLayout.ansichtBreite} ${wegweiserLayout.ansichtHoehe}`}
  xmlns="http://www.w3.org/2000/svg"
>
  <title id="sign-title">HBR-Pfeilwegweiser</title>
  <desc id="sign-description">
    Pfeilwegweiser mit {visibleLines.length} Zielzeile{visibleLines.length === 1 ? '' : 'n'}
    und Richtung {data.direction === 'right' ? 'rechts' : 'links'}.
  </desc>
  <rect width={wegweiserLayout.ansichtBreite} height={wegweiserLayout.ansichtHoehe} fill="#f8fafc" />
  <path
    d={geometry.signPath}
    fill="#ffffff"
    stroke="#d7001f"
    stroke-linejoin="round"
    stroke-width="4"
  />
  <path d={geometry.arrowFillPath} fill="#d7001f" />
  <line
    x1={geometry.arrowDividerX}
    x2={geometry.arrowDividerX}
    y1={geometry.dividerY1}
    y2={geometry.dividerY2}
    stroke="#d7001f"
    stroke-width="3"
  />
  <line
    x1={geometry.iconAreaEndX}
    x2={geometry.iconAreaEndX}
    y1={geometry.guideY1}
    y2={geometry.guideY2}
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.6"
  />
  <line
    x1={geometry.targetAreaEndX}
    x2={geometry.targetAreaEndX}
    y1={geometry.guideY1}
    y2={geometry.guideY2}
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.6"
  />
  <line
    x1={geometry.distanceAreaStartX}
    x2={geometry.distanceAreaStartX}
    y1={geometry.guideY1}
    y2={geometry.guideY2}
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.6"
  />

  {#each visibleLines as line}
    {@const y = line.y}
    {#if line.pictogram !== 'none'}
      <g class="svg-pictogram">
        <rect
          x={geometry.iconX}
          y={y - geometry.iconSize / 2}
          width={geometry.iconSize}
          height={geometry.iconSize}
          rx="3"
        />
        <text x={geometry.iconX + geometry.iconSize / 2} y={y}>{pictogramLabel(line.pictogram)}</text>
        {#if line.pictogram === 'station'}
          <path d={`M${geometry.iconX + 11} ${y + 13}h34M${geometry.iconX + 17} ${y + 19}h22`} />
        {:else if line.pictogram === 'center'}
          <circle cx={geometry.iconX + geometry.iconSize / 2} cy={y} r="13" />
        {:else if line.pictogram === 'ferry'}
          <path d={`M${geometry.iconX + 10} ${y + 12}h36l-7 9H${geometry.iconX + 17}z`} />
        {/if}
      </g>
    {/if}
    <text
      x={geometry.contentStartX}
      y={y}
      fill="#d7001f"
      font-family="Arial, Helvetica, sans-serif"
      font-size={wegweiserLayout.textSchriftGroesse}
      font-weight="500"
      dominant-baseline="middle"
    >
      {line.destination}
    </text>
    <text
      x={geometry.distanceEndX}
      y={y}
      fill="#d7001f"
      font-family="Arial, Helvetica, sans-serif"
      font-size={wegweiserLayout.textSchriftGroesse}
      font-weight="500"
      dominant-baseline="middle"
      text-anchor="end"
    >
      {formatDistance(line.distance)}
    </text>
  {/each}

  {#if routes.length}
    {#each routes as route, index}
      {@const x = routeX(index)}
      {@const label = getRouteLabel(route)}
      {@const labelLines = getRouteTextLines(label)}
      {@const fontSize = getRouteFontSize(label)}
      {@const lineHeight = fontSize + 2}
      <g class="svg-route-item">
        <rect
          x={x}
          y={geometry.routeY}
          width={geometry.routeSize}
          height={geometry.routeSize}
          rx="2"
        />
        <text font-size={fontSize}>
          {#each labelLines as labelLine, lineIndex}
            <tspan
              x={x + geometry.routeSize / 2}
              y={lineIndex === 0 ? routeTextY(label) : undefined}
              dy={lineIndex === 0 ? undefined : lineHeight}
            >
              {labelLine}
            </tspan>
          {/each}
        </text>
      </g>
    {/each}
  {/if}
</svg>
