<script lang="ts">
  import type { WegweiserData, WegweiserValidation } from '$lib/wegweiser';
  import { formatDistance } from '$lib/wegweiser';

  let {
    data = $bindable(),
    errors
  }: {
    data: WegweiserData;
    errors: WegweiserValidation;
  } = $props();

  function formatField(field: 'farDistance' | 'nearDistance') {
    data[field] = formatDistance(data[field]);
  }
</script>

<form class="editor-form" novalidate>
  <div class="form-row">
    <label>
      <span>Fernziel oben</span>
      <input
        aria-invalid={Boolean(errors.farDestination)}
        bind:value={data.farDestination}
        name="farDestination"
        type="text"
      />
      {#if errors.farDestination}
        <small>{errors.farDestination}</small>
      {/if}
    </label>

    <label>
      <span>Entfernung</span>
      <input
        aria-invalid={Boolean(errors.farDistance)}
        bind:value={data.farDistance}
        name="farDistance"
        onblur={() => formatField('farDistance')}
        type="text"
      />
      {#if errors.farDistance}
        <small>{errors.farDistance}</small>
      {/if}
    </label>
  </div>

  <div class="form-row">
    <label>
      <span>Nahziel zweite Zeile</span>
      <input bind:value={data.nearDestination} name="nearDestination" type="text" />
    </label>

    <label>
      <span>Entfernung</span>
      <input
        aria-invalid={Boolean(errors.nearDistance)}
        bind:value={data.nearDistance}
        name="nearDistance"
        onblur={() => formatField('nearDistance')}
        type="text"
      />
      {#if errors.nearDistance}
        <small>{errors.nearDistance}</small>
      {/if}
    </label>
  </div>

  <fieldset class="direction-field">
    <legend>Richtung</legend>
    <label class="radio-option">
      <input bind:group={data.direction} name="direction" type="radio" value="left" />
      <span>linksweisend</span>
    </label>
    <label class="radio-option">
      <input bind:group={data.direction} name="direction" type="radio" value="right" />
      <span>rechtsweisend</span>
    </label>
  </fieldset>
</form>
