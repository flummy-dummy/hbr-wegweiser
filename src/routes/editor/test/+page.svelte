<script lang="ts">
  import WegweiserForm from '$lib/components/WegweiserForm.svelte';
  import WegweiserPreview from '$lib/components/WegweiserPreview.svelte';
  import { defaultWegweiserData, validateWegweiser } from '$lib/wegweiser';
  import type { WegweiserData, WegweiserOption } from '$lib/wegweiser';

  let {
    data
  }: {
    data: {
      pictogramOptions: WegweiserOption[];
      routeOptions: WegweiserOption[];
    };
  } = $props();

  function getInitialWegweiserData(): WegweiserData {
    return {
      ...defaultWegweiserData,
      farPictograms: [],
      farRoutePictograms: [],
      nearPictograms: [],
      nearRoutePictograms: [],
      routes: data.routeOptions.slice(0, 2).map((option) => ({
        type: 'themenroute',
        route: option.value
      }))
    };
  }

  let wegweiser = $state<WegweiserData>(getInitialWegweiserData());
  const errors = $derived(validateWegweiser(wegweiser));
</script>

<svelte:head>
  <title>Editor Test | HBR-Wegweiser-Generator</title>
</svelte:head>

<main class="page editor-page">
  <header class="editor-header">
    <a href="/">Startseite</a>
    <h1>Editor-Test</h1>
    <p>Erster fachlicher MVP für einen HBR-Pfeilwegweiser.</p>
  </header>

  <section class="editor-grid" aria-label="Editor-Arbeitsbereich">
    <div class="panel">
      <p class="eyebrow">Formular</p>
      <h2>Eingaben</h2>
      <WegweiserForm
        bind:data={wegweiser}
        {errors}
        pictogramOptions={data.pictogramOptions}
        routeOptions={data.routeOptions}
      />
    </div>

    <div class="panel preview-panel">
      <p class="eyebrow">Vorschau</p>
      <h2>Wegweiser-Vorschau</h2>
      <WegweiserPreview
        data={wegweiser}
        pictogramOptions={data.pictogramOptions}
        routeOptions={data.routeOptions}
      />
    </div>
  </section>
</main>
