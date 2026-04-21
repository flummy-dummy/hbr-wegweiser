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
  {#if errors.form}
    <p class="form-error">{errors.form}</p>
  {/if}

  <div class="form-row">
    <label>
      <span>Obere Zielzeile</span>
      <input bind:value={data.farDestination} name="farDestination" type="text" />
    </label>

    <label>
      <span>Entfernung</span>
      <input
        aria-invalid={Boolean(errors.farDistance)}
        bind:value={data.farDistance}
        inputmode="decimal"
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
      <span>Untere Zielzeile</span>
      <input bind:value={data.nearDestination} name="nearDestination" type="text" />
    </label>

    <label>
      <span>Entfernung</span>
      <input
        aria-invalid={Boolean(errors.nearDistance)}
        bind:value={data.nearDistance}
        inputmode="decimal"
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
