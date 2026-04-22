<script lang="ts">
  import type { RouteOption, WegweiserData, WegweiserOption, WegweiserValidation } from '$lib/wegweiser';
  import {
    formatDistance,
    pictogramOptions as fallbackPictogramOptions,
    routeOptions as fallbackRouteOptions
  } from '$lib/wegweiser';

  let {
    data = $bindable(),
    errors,
    pictogramOptions = fallbackPictogramOptions,
    routeOptions = fallbackRouteOptions
  }: {
    data: WegweiserData;
    errors: WegweiserValidation;
    pictogramOptions?: WegweiserOption[];
    routeOptions?: WegweiserOption[];
  } = $props();

  let routeSearch = $state('');
  let farTargetPictogramSearch = $state('');
  let farRoutePictogramSearch = $state('');
  let nearTargetPictogramSearch = $state('');
  let nearRoutePictogramSearch = $state('');
  const targetPictogramOptions = $derived(
    pictogramOptions.filter((option) => option.value !== 'none' && option.kategorie === 'ziel')
  );
  const routePictogramOptions = $derived(
    pictogramOptions.filter((option) => option.value !== 'none' && option.kategorie === 'strecke')
  );
  const selectedRouteOptions = $derived(
    data.routes
      .map((route) => routeOptions.find((option) => option.value === route))
      .filter((option): option is WegweiserOption => Boolean(option))
  );
  const filteredRouteOptions = $derived(
    routeOptions
      .filter((option) => !data.routes.includes(option.value))
      .filter((option) => {
        const query = routeSearch.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return [option.label, option.kurzlabel, option.slug]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query));
      })
      .slice(0, 8)
  );

  function formatField(field: 'farDistance' | 'nearDistance') {
    data[field] = formatDistance(data[field]);
  }

  function filterPictograms(
    options: WegweiserOption[],
    selectedValues: string[],
    query: string
  ): WegweiserOption[] {
    const normalizedQuery = query.trim().toLowerCase();

    return options
      .filter((option) => !selectedValues.includes(option.value))
      .filter((option) => {
        if (!normalizedQuery) {
          return true;
        }

        return [option.label, option.kurzlabel, option.slug]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 6);
  }

  function selectedPictogramOptions(values: string[]): WegweiserOption[] {
    return values
      .map((value) => pictogramOptions.find((option) => option.value === value))
      .filter((option): option is WegweiserOption => Boolean(option));
  }

  function addPictogram(field: 'farPictograms' | 'farRoutePictograms' | 'nearPictograms' | 'nearRoutePictograms', value: string) {
    if (data[field].includes(value) || data[field].length >= 2) {
      return;
    }

    data[field] = [...data[field], value];
  }

  function removePictogram(field: 'farPictograms' | 'farRoutePictograms' | 'nearPictograms' | 'nearRoutePictograms', value: string) {
    data[field] = data[field].filter((selectedValue) => selectedValue !== value);
  }

  function clearPictogramSearch(field: 'farPictograms' | 'farRoutePictograms' | 'nearPictograms' | 'nearRoutePictograms') {
    if (field === 'farPictograms') farTargetPictogramSearch = '';
    if (field === 'farRoutePictograms') farRoutePictogramSearch = '';
    if (field === 'nearPictograms') nearTargetPictogramSearch = '';
    if (field === 'nearRoutePictograms') nearRoutePictogramSearch = '';
  }

  function addRoute(route: RouteOption) {
    if (data.routes.includes(route) || data.routes.length >= 6) {
      return;
    }

    data.routes = [...data.routes, route];
    routeSearch = '';
  }

  function removeRoute(route: RouteOption) {
    data.routes = data.routes.filter((selectedRoute) => selectedRoute !== route);
  }

  function moveRoute(route: RouteOption, direction: -1 | 1) {
    const index = data.routes.indexOf(route);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= data.routes.length) {
      return;
    }

    const nextRoutes = [...data.routes];
    [nextRoutes[index], nextRoutes[targetIndex]] = [nextRoutes[targetIndex], nextRoutes[index]];
    data.routes = nextRoutes;
  }
</script>

{#snippet pictogramPicker(
  label: string,
  field: 'farPictograms' | 'farRoutePictograms' | 'nearPictograms' | 'nearRoutePictograms',
  options: WegweiserOption[],
  searchValue: string
)}
  <div class="pictogram-picker">
    <label>
      <span>{label}</span>
      <input
        disabled={data[field].length >= 2}
        placeholder={data[field].length >= 2 ? 'Maximal 2 ausgewählt' : 'Piktogramm suchen'}
        type="search"
        value={searchValue}
        oninput={(event) => {
          const value = event.currentTarget.value;
          if (field === 'farPictograms') farTargetPictogramSearch = value;
          if (field === 'farRoutePictograms') farRoutePictogramSearch = value;
          if (field === 'nearPictograms') nearTargetPictogramSearch = value;
          if (field === 'nearRoutePictograms') nearRoutePictogramSearch = value;
        }}
      />
    </label>

    <div class="pictogram-results">
      {#if data[field].length < 2 && searchValue.trim()}
        {#each filterPictograms(options, data[field], searchValue) as option}
          <button
            class="pictogram-result"
            type="button"
            onclick={() => {
              addPictogram(field, option.value);
              clearPictogramSearch(field);
            }}
          >
            {#if option.imageUrl}
              <img alt="" src={option.imageUrl} />
            {:else}
              <span>{option.kurzlabel ?? option.label.slice(0, 2)}</span>
            {/if}
            <strong>{option.label}</strong>
          </button>
        {/each}
      {/if}
    </div>

    <div class="pictogram-chips">
      {#each selectedPictogramOptions(data[field]) as option}
        <span class="pictogram-chip">
          {#if option.imageUrl}
            <img alt="" src={option.imageUrl} />
          {:else}
            <span>{option.kurzlabel ?? option.label.slice(0, 2)}</span>
          {/if}
          {option.label}
          <button
            aria-label={`${option.label} entfernen`}
            type="button"
            onclick={() => removePictogram(field, option.value)}
          >
            ×
          </button>
        </span>
      {/each}
    </div>
  </div>
{/snippet}

<form class="editor-form" novalidate>
  {#if errors.form}
    <p class="form-error">{errors.form}</p>
  {/if}

  <div class="line-fieldset">
    <p class="field-group-title">Obere Zielzeile</p>
    <div class="destination-line-editor">
      <div class="destination-line-main">
        <label>
          <span>Ziel / Ort</span>
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
      <div class="pictogram-picker-row">
        {@render pictogramPicker('Zielpiktogramme', 'farPictograms', targetPictogramOptions, farTargetPictogramSearch)}
        {@render pictogramPicker('Streckenpiktogramme', 'farRoutePictograms', routePictogramOptions, farRoutePictogramSearch)}
      </div>
    </div>
  </div>

  <div class="line-fieldset">
    <p class="field-group-title">Untere Zielzeile</p>
    <div class="destination-line-editor">
      <div class="destination-line-main">
        <label>
          <span>Ziel / Ort</span>
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
      <div class="pictogram-picker-row">
        {@render pictogramPicker('Zielpiktogramme', 'nearPictograms', targetPictogramOptions, nearTargetPictogramSearch)}
        {@render pictogramPicker('Streckenpiktogramme', 'nearRoutePictograms', routePictogramOptions, nearRoutePictogramSearch)}
      </div>
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

    <label class="route-search">
      <span>Themenroute suchen</span>
      <input
        bind:value={routeSearch}
        disabled={data.routes.length >= 6}
        name="routeSearch"
        placeholder={data.routes.length >= 6 ? 'Maximal 6 Routeneinschübe ausgewählt' : 'Name, Kurzlabel oder Slug'}
        type="search"
      />
    </label>

    <div class="route-results" aria-label="Gefundene Themenrouten">
      {#if data.routes.length >= 6}
        <p class="route-empty">Maximal 6 Themenrouten sind ausgewählt.</p>
      {:else if filteredRouteOptions.length}
        {#each filteredRouteOptions as option}
          <button class="route-result" type="button" onclick={() => addRoute(option.value)}>
            {#if option.imageUrl}
              <img alt="" src={option.imageUrl} />
            {:else}
              <span class="route-result-placeholder">{option.kurzlabel ?? option.label.slice(0, 2)}</span>
            {/if}
            <span>
              <strong>{option.label}</strong>
              {#if option.kurzlabel || option.slug}
                <small>{[option.kurzlabel, option.slug].filter(Boolean).join(' · ')}</small>
              {/if}
            </span>
          </button>
        {/each}
      {:else}
        <p class="route-empty">Keine passende Themenroute gefunden.</p>
      {/if}
    </div>

    <div class="selected-routes" aria-label="Ausgewählte Themenrouten">
      {#if selectedRouteOptions.length}
        {#each selectedRouteOptions as option, index}
          <div class="selected-route">
            <div class="selected-route-label">
              {#if option.imageUrl}
                <img alt="" src={option.imageUrl} />
              {:else}
                <span class="selected-route-placeholder">{option.kurzlabel ?? option.label.slice(0, 2)}</span>
              {/if}
              <span>{option.kurzlabel ?? option.label}</span>
            </div>
            <div class="selected-route-actions">
              <button
                aria-label={`${option.label} nach oben verschieben`}
                disabled={index === 0}
                type="button"
                onclick={() => moveRoute(option.value, -1)}
              >
                ↑
              </button>
              <button
                aria-label={`${option.label} nach unten verschieben`}
                disabled={index === selectedRouteOptions.length - 1}
                type="button"
                onclick={() => moveRoute(option.value, 1)}
              >
                ↓
              </button>
              <button type="button" onclick={() => removeRoute(option.value)}>Entfernen</button>
            </div>
          </div>
        {/each}
      {:else}
        <p class="route-empty">Noch keine Themenroute ausgewählt.</p>
      {/if}
    </div>
  </fieldset>
</form>
