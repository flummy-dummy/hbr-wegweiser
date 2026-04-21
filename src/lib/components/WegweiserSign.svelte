<script lang="ts">
  import type { DestinationPictogram, WegweiserData } from '$lib/wegweiser';
  import {
    formatDistance,
    getLineYPositions,
    getRouteLabel,
    getSignGeometry,
    getVisibleLines
  } from '$lib/wegweiser';

  let { data }: { data: WegweiserData } = $props();

  const geometry = $derived(getSignGeometry(data.direction));
  const visibleLines = $derived(getVisibleLines(data).filter((line) => line.destination));
  const lineYPositions = $derived(getLineYPositions(visibleLines.length));
  const routes = $derived(data.routes.slice(0, 6));
  function routeX(index: number) {
    const step = index * (geometry.routeSize + geometry.routeGap);

    return geometry.routeDirection === -1
      ? geometry.routeAnchorX - geometry.routeSize - step
      : geometry.routeAnchorX + step;
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
  viewBox="0 0 1000 330"
  xmlns="http://www.w3.org/2000/svg"
>
  <title id="sign-title">HBR-Pfeilwegweiser</title>
  <desc id="sign-description">
    Pfeilwegweiser mit {visibleLines.length} Zielzeile{visibleLines.length === 1 ? '' : 'n'}
    und Richtung {data.direction === 'right' ? 'rechts' : 'links'}.
  </desc>
  <rect width="1000" height="330" fill="#f8fafc" />
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
    y1="32"
    y2="218"
    stroke="#d7001f"
    stroke-width="3"
  />
  <line
    x1={geometry.iconAreaEndX}
    x2={geometry.iconAreaEndX}
    y1="48"
    y2="202"
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.6"
  />
  <line
    x1={geometry.targetAreaEndX}
    x2={geometry.targetAreaEndX}
    y1="48"
    y2="202"
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.6"
  />
  <line
    x1={geometry.distanceAreaStartX}
    x2={geometry.distanceAreaStartX}
    y1="48"
    y2="202"
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.6"
  />

  {#each visibleLines as line, index}
    {@const y = lineYPositions[index]}
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
      font-size="58"
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
      font-size="58"
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
      <g class="svg-route-item">
        <rect
          x={x}
          y={geometry.routeY}
          width={geometry.routeSize}
          height={geometry.routeSize}
          rx="2"
        />
        <text x={x + geometry.routeSize / 2} y={geometry.routeY + geometry.routeSize / 2}>
          {getRouteLabel(route)}
        </text>
      </g>
    {/each}
  {/if}
</svg>
