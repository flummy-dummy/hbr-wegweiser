<script lang="ts">
  type Direction = 'left' | 'right';

  let farDestination = $state('Fernziel');
  let farDistance = $state('1,0');
  let nearDestination = $state('Nahziel');
  let nearDistance = $state('5,6');
  let direction = $state<Direction>('right');

  const signPath = $derived(
    direction === 'right'
      ? 'M40 30H880L970 125L880 220H40Z'
      : 'M960 30H120L30 125L120 220H960Z'
  );
  const arrowFillPath = $derived(
    direction === 'right'
      ? 'M880 30L970 125L880 220Z'
      : 'M120 30L30 125L120 220Z'
  );
  const labelX = $derived(direction === 'right' ? 235 : 300);
  const distanceX = $derived(direction === 'right' ? 690 : 755);
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
      <form class="editor-form">
        <div class="form-row">
          <label>
            <span>Fernziel oben</span>
            <input bind:value={farDestination} name="farDestination" type="text" />
          </label>

          <label>
            <span>Entfernung</span>
            <input bind:value={farDistance} name="farDistance" type="text" />
          </label>
        </div>

        <div class="form-row">
          <label>
            <span>Nahziel zweite Zeile</span>
            <input bind:value={nearDestination} name="nearDestination" type="text" />
          </label>

          <label>
            <span>Entfernung</span>
            <input bind:value={nearDistance} name="nearDistance" type="text" />
          </label>
        </div>

        <fieldset class="direction-field">
          <legend>Richtung</legend>
          <label class="radio-option">
            <input bind:group={direction} name="direction" type="radio" value="left" />
            <span>linksweisend</span>
          </label>
          <label class="radio-option">
            <input bind:group={direction} name="direction" type="radio" value="right" />
            <span>rechtsweisend</span>
          </label>
        </fieldset>
      </form>
    </div>

    <div class="panel preview-panel">
      <p class="eyebrow">Vorschau</p>
      <h2>Wegweiser-Vorschau</h2>
      <div class="svg-preview" aria-label="SVG-Vorschau Pfeilwegweiser">
        <svg
          role="img"
          aria-labelledby="sign-title sign-description"
          viewBox="0 0 1000 250"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id="sign-title">HBR-Pfeilwegweiser</title>
          <desc id="sign-description">
            Pfeilwegweiser mit Fernziel {farDestination}, Nahziel {nearDestination}
            und Richtung {direction === 'right' ? 'rechts' : 'links'}.
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
            x1={direction === 'right' ? 880 : 120}
            x2={direction === 'right' ? 880 : 120}
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
            {farDestination}
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
          <text
            x={labelX}
            y="170"
            fill="#d7001f"
            font-family="Arial, Helvetica, sans-serif"
            font-size="58"
            font-weight="500"
          >
            {nearDestination}
          </text>
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
      </div>
      <p class="direction-label">
        {direction === 'right' ? 'rechtsweisend' : 'linksweisend'}
      </p>
    </div>
  </section>
</main>
