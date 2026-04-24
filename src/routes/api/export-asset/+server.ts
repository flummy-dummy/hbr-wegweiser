import { getPocketBaseBaseUrl } from '$lib/server/pocketbase';
import { error } from '@sveltejs/kit';

function isAllowedPocketBaseAssetUrl(assetUrl: URL, baseUrl: URL): boolean {
  return assetUrl.origin === baseUrl.origin;
}

export async function GET({ url, fetch }) {
  const encodedUrl = url.searchParams.get('url');

  if (!encodedUrl) {
    throw error(400, 'Fehlende Asset-URL.');
  }

  const pocketBaseBaseUrl = getPocketBaseBaseUrl();

  if (!pocketBaseBaseUrl) {
    console.warn('PUBLIC_POCKETBASE_URL ist nicht gesetzt. Export-Assets koennen nicht geladen werden.');
    throw error(503, 'PocketBase ist nicht konfiguriert.');
  }

  let assetUrl: URL;
  let baseUrl: URL;

  try {
    assetUrl = new URL(encodedUrl);
    baseUrl = new URL(pocketBaseBaseUrl);
  } catch {
    throw error(400, 'Ungueltige Asset-URL.');
  }

  if (!isAllowedPocketBaseAssetUrl(assetUrl, baseUrl)) {
    throw error(403, 'Asset-URL ist fuer den Export nicht erlaubt.');
  }

  const response = await fetch(assetUrl.toString());

  if (!response.ok) {
    console.warn('PocketBase-Asset konnte fuer den PNG-Export nicht geladen werden.', {
      url: assetUrl.toString(),
      status: response.status
    });
    throw error(502, 'Asset konnte nicht geladen werden.');
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const body = await response.arrayBuffer();

  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': 'private, max-age=300'
    }
  });
}
