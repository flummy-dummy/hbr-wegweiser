<script lang="ts">
  import type { WegweiserData } from '$lib/wegweiser';
  import {
    formatDistance,
    getLineYPositions,
    getSignGeometry,
    getVisibleLines
  } from '$lib/wegweiser';

  let { data }: { data: WegweiserData } = $props();

  const geometry = $derived(getSignGeometry(data.direction));
  const visibleLines = $derived(getVisibleLines(data).filter((line) => line.destination));
  const lineYPositions = $derived(getLineYPositions(visibleLines.length));
</script>

<svg
  role="img"
  aria-labelledby="sign-title sign-description"
  viewBox="0 0 1000 250"
  xmlns="http://www.w3.org/2000/svg"
>
  <title id="sign-title">HBR-Pfeilwegweiser</title>
  <desc id="sign-description">
    Pfeilwegweiser mit {visibleLines.length} Zielzeile{visibleLines.length === 1 ? '' : 'n'}
    und Richtung {data.direction === 'right' ? 'rechts' : 'links'}.
  </desc>
  <rect width="1000" height="250" fill="#f8fafc" />
  <path
    d={geometry.signPath}
    fill="#ffffff"
    stroke="#8f8f8f"
    stroke-linejoin="round"
    stroke-width="4"
  />
  <path d={geometry.arrowFillPath} fill="#d7001f" />
  <line
    x1={geometry.arrowDividerX}
    x2={geometry.arrowDividerX}
    y1="32"
    y2="218"
    stroke="#c8c8c8"
    stroke-width="3"
  />
  <line
    x1={geometry.targetAreaEndX}
    x2={geometry.targetAreaEndX}
    y1="48"
    y2="202"
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.65"
  />
  <line
    x1={geometry.distanceAreaStartX}
    x2={geometry.distanceAreaStartX}
    y1="48"
    y2="202"
    stroke="#c8c8c8"
    stroke-dasharray="10 8"
    stroke-width="3"
    opacity="0.65"
  />

  {#each visibleLines as line, index}
    <text
      x={geometry.contentStartX}
      y={lineYPositions[index]}
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
      y={lineYPositions[index]}
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
</svg>
