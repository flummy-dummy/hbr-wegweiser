<script lang="ts">
  import type {
    WegweiserData,
    WegweiserFormatErrorMap,
    WegweiserFormatMap,
    WegweiserOption
  } from '$lib/wegweiser';
  import { buildWegweiserSvgFromFormat, wegweiserLayout } from '$lib/wegweiser';

  let {
    data,
    draftTitle = '',
    formats = {},
    formatErrors = {},
    pictogramOptions = [],
    routeOptions = []
  }: {
    data: WegweiserData;
    draftTitle?: string;
    formats?: WegweiserFormatMap;
    formatErrors?: WegweiserFormatErrorMap;
    pictogramOptions?: WegweiserOption[];
    routeOptions?: WegweiserOption[];
  } = $props();

  const currentFormat = $derived(formats[data.direction] ?? null);
  const currentFormatError = $derived(
    formatErrors[data.direction] ??
      `Das PocketBase-Format ${data.direction === 'right' ? 'pfeilwegweiser_rechts' : 'pfeilwegweiser_links'} konnte nicht geladen werden.`
  );
  const previewSvg = $derived(
    currentFormat?.svg
      ? buildWegweiserSvgFromFormat(data, currentFormat.svg, { pictogramOptions, routeOptions })
      : ''
  );

  const TRANSPARENT_PIXEL_DATA_URL =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  function getDownloadBaseName(): string {
    const normalized = draftTitle
      .trim()
      .toLowerCase()
      .replaceAll('ä', 'ae')
      .replaceAll('ö', 'oe')
      .replaceAll('ü', 'ue')
      .replaceAll('ß', 'ss')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized || 'hbr-wegweiser';
  }

  function findOption(value: string, options: WegweiserOption[]): WegweiserOption | undefined {
    return options.find((option) => option.value === value || option.slug === value);
  }

  function collectExportImageUrls(): string[] {
    const urls = new Set<string>();

    for (const value of [
      ...data.farPictograms,
      ...data.farRoutePictograms,
      ...data.nearPictograms,
      ...data.nearRoutePictograms
    ]) {
      if (!value || value === 'none') {
        continue;
      }

      const imageUrl = findOption(value, pictogramOptions)?.imageUrl;

      if (imageUrl) {
        urls.add(imageUrl);
      }
    }

    for (const route of data.routes) {
      if (route.type !== 'themenroute') {
        continue;
      }

      const imageUrl = findOption(route.route, routeOptions)?.imageUrl;

      if (imageUrl) {
        urls.add(imageUrl);
      }
    }

    return [...urls];
  }

  async function blobToDataUrl(blob: Blob): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Blob konnte nicht als Data-URL gelesen werden.'));
      };
      reader.onerror = () => reject(new Error('Blob konnte nicht gelesen werden.'));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchAssetDataUrl(assetUrl: string): Promise<string> {
    const response = await fetch(`/api/export-asset?url=${encodeURIComponent(assetUrl)}`);

    if (!response.ok) {
      throw new Error(`Asset konnte nicht geladen werden (${response.status}).`);
    }

    const blob = await response.blob();

    return await blobToDataUrl(blob);
  }

  async function buildEmbeddedExportSvg(): Promise<string> {
    const svg = buildWegweiserSvgFromFormat(data, currentFormat?.svg ?? '', { pictogramOptions, routeOptions });
    const imageUrls = collectExportImageUrls();

    if (!imageUrls.length) {
      return svg;
    }

    const parser = new DOMParser();
    const document = parser.parseFromString(svg, 'image/svg+xml');
    const imageNodes = [...document.querySelectorAll('image[href]')];
    const embeddedUrls = new Map<string, string>();

    await Promise.all(
      imageUrls.map(async (imageUrl) => {
        try {
          const dataUrl = await fetchAssetDataUrl(imageUrl);
          embeddedUrls.set(imageUrl, dataUrl);
        } catch (error) {
          console.warn('Export-Asset konnte nicht eingebettet werden. Leerer Platzhalter wird verwendet.', {
            imageUrl,
            error
          });
          embeddedUrls.set(imageUrl, TRANSPARENT_PIXEL_DATA_URL);
        }
      })
    );

    for (const imageNode of imageNodes) {
      const href = imageNode.getAttribute('href');

      if (!href) {
        continue;
      }

      const embeddedUrl = embeddedUrls.get(href);

      if (!embeddedUrl) {
        continue;
      }

      imageNode.setAttribute('href', embeddedUrl);
      imageNode.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', embeddedUrl);
    }

    return new XMLSerializer().serializeToString(document);
  }

  function downloadSvg() {
    if (!currentFormat?.svg) {
      return;
    }

    const svg = buildWegweiserSvgFromFormat(data, currentFormat.svg, { pictogramOptions, routeOptions });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${getDownloadBaseName()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPng() {
    if (!currentFormat?.svg) {
      return;
    }

    const svg = await buildEmbeddedExportSvg();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('SVG konnte nicht in ein Bild geladen werden.'));
        nextImage.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = wegweiserLayout.ansichtBreite;
      canvas.height = wegweiserLayout.ansichtHoehe;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas-Kontext konnte nicht erzeugt werden.');
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pngBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });

      if (!pngBlob) {
        throw new Error('PNG-Datei konnte nicht erzeugt werden.');
      }

      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement('a');

      link.href = pngUrl;
      link.download = `${getDownloadBaseName()}.png`;
      link.click();
      URL.revokeObjectURL(pngUrl);
    } catch (error) {
      console.error('PNG-Export fehlgeschlagen.', error);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }
</script>

<div class="svg-preview" aria-label="SVG-Vorschau Pfeilwegweiser">
  {#if previewSvg}
    {@html previewSvg}
  {:else}
    <p class="svg-preview-error">
      {currentFormatError}
    </p>
  {/if}
</div>
<div class="preview-actions">
  <p class="direction-label">
    {data.direction === 'right' ? 'rechtsweisend' : 'linksweisend'}
  </p>
  <div class="preview-downloads">
    <button class="button secondary-button" type="button" disabled={!currentFormat?.svg} onclick={downloadSvg}>
      SVG herunterladen
    </button>
    <button class="button secondary-button" type="button" disabled={!currentFormat?.svg} onclick={downloadPng}>
      PNG herunterladen
    </button>
  </div>
</div>
