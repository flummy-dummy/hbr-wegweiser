<script lang="ts">
  import KatasterMap from '$lib/components/KatasterMap.svelte';
  import type { KatasterMapRecord } from '$lib/kataster';

  let {
    data
  }: {
    data: {
      knoten: KatasterMapRecord[];
      pfosten: KatasterMapRecord[];
      kanten: KatasterMapRecord[];
      themenrouten: KatasterMapRecord[];
      knotenpunktverbindungen: KatasterMapRecord[];
      pocketBaseWarning: string | null;
    };
  } = $props();
</script>

<svelte:head>
  <title>Katasterkarte | HBR-Wegweiser-Generator</title>
</svelte:head>

<main class="page kataster-page">
  <header class="editor-header">
    <a href="/">Startseite</a>
    <h1>Katasterkarte</h1>
    <p>OpenStreetMap-Basiskarte mit Knoten, Pfosten und Kanten aus dem Beschilderungskataster.</p>
  </header>

  {#if data.pocketBaseWarning}
    <p class="form-message error-message">{data.pocketBaseWarning}</p>
  {/if}

  <section class="panel kataster-panel">
    <div class="kataster-toolbar">
      <span>Knoten: {data.knoten.length}</span>
      <span>Pfosten: {data.pfosten.length}</span>
      <span>Kanten: {data.kanten.length}</span>
      <span>Themenrouten: {data.themenrouten.length}</span>
      <span>Knotenpunktverbindungen: {data.knotenpunktverbindungen.length}</span>
    </div>

    <KatasterMap
      knoten={data.knoten}
      pfosten={data.pfosten}
      kanten={data.kanten}
      themenrouten={data.themenrouten}
      knotenpunktverbindungen={data.knotenpunktverbindungen}
    />
  </section>
</main>
