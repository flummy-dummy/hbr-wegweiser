<script lang="ts">
  let title = $state('HBR Wegweiser');
  let destination1 = $state('Musterziel');
  let distance1 = $state('2,4 km');
</script>

<svelte:head>
  <title>Editor Test | HBR-Wegweiser-Generator</title>
</svelte:head>

<main class="page editor-page">
  <header class="editor-header">
    <a href="/">Startseite</a>
    <h1>Editor-Test</h1>
    <p>Grundlayout für Formular und SVG-Vorschau.</p>
  </header>

  <section class="editor-grid" aria-label="Editor-Arbeitsbereich">
    <div class="panel">
      <p class="eyebrow">Formular</p>
      <h2>Eingaben</h2>
      <form class="editor-form">
        <label>
          <span>Titel</span>
          <input bind:value={title} name="title" type="text" />
        </label>

        <label>
          <span>Ziel 1</span>
          <input bind:value={destination1} name="destination1" type="text" />
        </label>

        <label>
          <span>Entfernung 1</span>
          <input bind:value={distance1} name="distance1" type="text" />
        </label>
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
          <title id="sign-title">{title}</title>
          <desc id="sign-description">
            Pfeilwegweiser mit Ziel {destination1} und Entfernung {distance1}.
          </desc>
          <rect width="1000" height="250" fill="#eef2f7" />
          <path
            d="M40 45H795L960 125L795 205H40Z"
            fill="#ffffff"
            stroke="#1e293b"
            stroke-linejoin="round"
            stroke-width="10"
          />
          <path d="M795 45L960 125L795 205" fill="#f8fafc" opacity="0.8" />
          <line
            x1="795"
            x2="795"
            y1="52"
            y2="198"
            stroke="#d5dce8"
            stroke-width="4"
          />
          <text
            x="82"
            y="88"
            fill="#334155"
            font-family="Arial, Helvetica, sans-serif"
            font-size="42"
            font-weight="700"
          >
            {title}
          </text>
          <text
            x="82"
            y="158"
            fill="#111827"
            font-family="Arial, Helvetica, sans-serif"
            font-size="66"
            font-weight="800"
          >
            {destination1}
          </text>
          <text
            x="630"
            y="158"
            fill="#111827"
            font-family="Arial, Helvetica, sans-serif"
            font-size="52"
            font-weight="700"
            text-anchor="middle"
          >
            {distance1}
          </text>
        </svg>
      </div>
    </div>
  </section>
</main>
