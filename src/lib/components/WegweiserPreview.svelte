<script lang="ts">
  import type { WegweiserData, WegweiserOption } from '$lib/wegweiser';
  import { buildWegweiserSvg } from '$lib/wegweiser';
  import WegweiserSign from './WegweiserSign.svelte';

  let {
    data,
    pictogramOptions = [],
    routeOptions = []
  }: {
    data: WegweiserData;
    pictogramOptions?: WegweiserOption[];
    routeOptions?: WegweiserOption[];
  } = $props();

  function downloadSvg() {
    const svg = buildWegweiserSvg(data, { pictogramOptions, routeOptions });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'hbr-pfeilwegweiser.svg';
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="svg-preview" aria-label="SVG-Vorschau Pfeilwegweiser">
  <WegweiserSign {data} {pictogramOptions} {routeOptions} />
</div>
<div class="preview-actions">
  <p class="direction-label">
    {data.direction === 'right' ? 'rechtsweisend' : 'linksweisend'}
  </p>
  <button class="button secondary-button" type="button" onclick={downloadSvg}>
    SVG herunterladen
  </button>
</div>
