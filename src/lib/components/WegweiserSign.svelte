<script lang="ts">
  import type { DestinationPictogram, WegweiserData, WegweiserOption } from '$lib/wegweiser';
  import {
    findPictogramOption,
    findRouteOption,
    formatDistance,
    getRouteLabel,
    getRouteFontSize,
    getRouteTextLines,
    getSignGeometry,
    getWegweiserRows,
    wegweiserLayout
  } from '$lib/wegweiser';

  let {
    data,
    pictogramOptions = [],
    routeOptions = []
  }: {
    data: WegweiserData;
    pictogramOptions?: WegweiserOption[];
    routeOptions?: WegweiserOption[];
  } = $props();

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

  function fallbackPictogramLabel(option: WegweiserOption | undefined, pictogram: DestinationPictogram) {
    return option?.kurzlabel ?? option?.label.slice(0, 3) ?? pictogram.slice(0, 3);
  }

  function pictogramX(startX: number, index: number) {
    return startX + index * (geometry.lineIconSize + geometry.lineIconGap);
  }

  function routePictogramStartX(count: number) {
    return (
      geometry.distanceAreaStartX -
      count * geometry.lineIconSize -
      Math.max(0, count - 1) * geometry.lineIconGap -
      geometry.lineIconGap
    );
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
    {@const targetTextX = line.pictograms.length ? geometry.contentStartX : geometry.textStartX}
    {#each line.pictograms as pictogram, pictogramIndex}
      {@const pictogramOption = findPictogramOption(pictogram, pictogramOptions)}
      {@const x = pictogramX(geometry.iconX, pictogramIndex)}
      <g class="svg-pictogram">
        <rect
          x={x}
          y={y - geometry.lineIconSize / 2}
          width={geometry.lineIconSize}
          height={geometry.lineIconSize}
          rx="3"
        />
        {#if pictogramOption?.imageUrl}
          <image
            href={pictogramOption.imageUrl}
            x={x + 5}
            y={y - geometry.lineIconSize / 2 + 5}
            width={geometry.lineIconSize - 10}
            height={geometry.lineIconSize - 10}
            preserveAspectRatio="xMidYMid meet"
          />
        {:else}
          <text x={x + geometry.lineIconSize / 2} y={y}>
            {pictogramLabel(pictogram) || fallbackPictogramLabel(pictogramOption, pictogram)}
          </text>
        {/if}
        {#if !pictogramOption?.imageUrl && pictogram === 'station'}
          <path d={`M${x + 8} ${y + 10}h28M${x + 13} ${y + 15}h18`} />
        {:else if !pictogramOption?.imageUrl && pictogram === 'center'}
          <circle cx={x + geometry.lineIconSize / 2} cy={y} r="11" />
        {:else if !pictogramOption?.imageUrl && pictogram === 'ferry'}
          <path d={`M${x + 8} ${y + 10}h28l-6 8H${x + 14}z`} />
        {/if}
      </g>
    {/each}
    <text
      x={targetTextX}
      y={y}
      fill="#d7001f"
      font-family="Arial, Helvetica, sans-serif"
      font-size={wegweiserLayout.textSchriftGroesse}
      font-weight="500"
      dominant-baseline="middle"
    >
      {line.destination}
    </text>
    {@const routePictogramStart = routePictogramStartX(line.routePictograms.length)}
    {#each line.routePictograms as pictogram, pictogramIndex}
      {@const pictogramOption = findPictogramOption(pictogram, pictogramOptions)}
      {@const x = pictogramX(routePictogramStart, pictogramIndex)}
      <g class="svg-pictogram">
        <rect
          x={x}
          y={y - geometry.lineIconSize / 2}
          width={geometry.lineIconSize}
          height={geometry.lineIconSize}
          rx="3"
        />
        {#if pictogramOption?.imageUrl}
          <image
            href={pictogramOption.imageUrl}
            x={x + 5}
            y={y - geometry.lineIconSize / 2 + 5}
            width={geometry.lineIconSize - 10}
            height={geometry.lineIconSize - 10}
            preserveAspectRatio="xMidYMid meet"
          />
        {:else}
          <text x={x + geometry.lineIconSize / 2} y={y}>
            {pictogramLabel(pictogram) || fallbackPictogramLabel(pictogramOption, pictogram)}
          </text>
        {/if}
      </g>
    {/each}
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
      {@const routeOption = findRouteOption(route, routeOptions)}
      {@const label = routeOption?.kurzlabel ?? routeOption?.label ?? getRouteLabel(route)}
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
        {#if routeOption?.imageUrl}
          <image
            href={routeOption.imageUrl}
            x={x + 6}
            y={geometry.routeY + 6}
            width={geometry.routeSize - 12}
            height={geometry.routeSize - 12}
            preserveAspectRatio="xMidYMid meet"
          />
        {:else}
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
        {/if}
      </g>
    {/each}
  {/if}
</svg>
