<script lang="ts">
  import type { RouteOption, WegweiserData, WegweiserValidation } from '$lib/wegweiser';
  import { formatDistance, pictogramOptions, routeOptions } from '$lib/wegweiser';

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

  function toggleRoute(route: RouteOption) {
    if (data.routes.includes(route)) {
      data.routes = data.routes.filter((selectedRoute) => selectedRoute !== route);
      return;
    }

    if (data.routes.length < 6) {
      data.routes = [...data.routes, route];
    }
  }
</script>

<form class="editor-form" novalidate>
  {#if errors.form}
    <p class="form-error">{errors.form}</p>
  {/if}

  <div class="line-fieldset">
    <p class="field-group-title">Obere Zielzeile</p>
    <div class="form-row with-pictogram">
      <label>
        <span>Ziel</span>
        <input bind:value={data.farDestination} name="farDestination" type="text" />
      </label>

      <label>
        <span>Piktogramm</span>
        <select bind:value={data.farPictogram} name="farPictogram">
          {#each pictogramOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
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
  </div>

  <div class="line-fieldset">
    <p class="field-group-title">Untere Zielzeile</p>
    <div class="form-row with-pictogram">
      <label>
        <span>Ziel</span>
        <input bind:value={data.nearDestination} name="nearDestination" type="text" />
      </label>

      <label>
        <span>Piktogramm</span>
        <select bind:value={data.nearPictogram} name="nearPictogram">
          {#each pictogramOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
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

  <fieldset class="routes-field">
    <legend>Routeneinschübe</legend>
    <div class="route-options">
      {#each routeOptions as option}
        <label class="checkbox-option">
          <input
            checked={data.routes.includes(option.value)}
            name="routes"
            onchange={() => toggleRoute(option.value)}
            type="checkbox"
          />
          <span>{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>
</form>
