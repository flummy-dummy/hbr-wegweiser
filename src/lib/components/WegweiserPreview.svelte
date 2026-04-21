<script lang="ts">
  import type { WegweiserData } from '$lib/wegweiser';
  import WegweiserSign from './WegweiserSign.svelte';

  let { data }: { data: WegweiserData } = $props();
</script>

<div class="svg-preview" aria-label="SVG-Vorschau Pfeilwegweiser">
  <WegweiserSign {data} />
</div>
<p class="direction-label">
  {data.direction === 'right' ? 'rechtsweisend' : 'linksweisend'}
</p>
