<script lang="ts">
  import type { WegweiserData } from '$lib/wegweiser';
  import { formatDistance } from '$lib/wegweiser';

  let { data }: { data: WegweiserData } = $props();

  const signPath = $derived(
    data.direction === 'right'
      ? 'M40 30H880L970 125L880 220H40Z'
      : 'M960 30H120L30 125L120 220H960Z'
  );
  const arrowFillPath = $derived(
    data.direction === 'right'
      ? 'M880 30L970 125L880 220Z'
      : 'M120 30L30 125L120 220Z'
  );
  const labelX = $derived(data.direction === 'right' ? 140 : 225);
  const distanceX = $derived(data.direction === 'right' ? 765 : 830);
  const arrowDividerX = $derived(data.direction === 'right' ? 880 : 120);
  const farDistance = $derived(formatDistance(data.farDistance));
  const nearDistance = $derived(formatDistance(data.nearDistance));
</script>

<svg
  role="img"
  aria-labelledby="sign-title sign-description"
  viewBox="0 0 1000 250"
  xmlns="http://www.w3.org/2000/svg"
>
  <title id="sign-title">HBR-Pfeilwegweiser</title>
  <desc id="sign-description">
    Pfeilwegweiser mit Fernziel {data.farDestination}, Nahziel {data.nearDestination}
    und Richtung {data.direction === 'right' ? 'rechts' : 'links'}.
  </desc>
  <rect width="1000" height="250" fill="#f8fafc" />
  <path
    d={signPath}
    fill="#ffffff"
    stroke="#8f8f8f"
    stroke-linejoin="round"
    stroke-width="4"
  />
  <path d={arrowFillPath} fill="#d7001f" />
  <line
    x1={arrowDividerX}
    x2={arrowDividerX}
    y1="34"
    y2="216"
    stroke="#c8c8c8"
    stroke-width="3"
  />

  <text
    x={labelX}
    y="92"
    fill="#d7001f"
    font-family="Arial, Helvetica, sans-serif"
    font-size="58"
    font-weight="500"
  >
    {data.farDestination || 'Fernziel'}
  </text>
  <text
    x={distanceX}
    y="92"
    fill="#d7001f"
    font-family="Arial, Helvetica, sans-serif"
    font-size="58"
    font-weight="500"
    text-anchor="end"
  >
    {farDistance}
  </text>

  {#if data.nearDestination.trim()}
    <text
      x={labelX}
      y="170"
      fill="#d7001f"
      font-family="Arial, Helvetica, sans-serif"
      font-size="58"
      font-weight="500"
    >
      {data.nearDestination}
    </text>
  {/if}
  <text
    x={distanceX}
    y="170"
    fill="#d7001f"
    font-family="Arial, Helvetica, sans-serif"
    font-size="58"
    font-weight="500"
    text-anchor="end"
  >
    {nearDistance}
  </text>
</svg>
