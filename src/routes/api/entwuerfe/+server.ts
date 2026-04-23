import { createPocketBaseAdminClient } from '$lib/server/pocketbase-admin';
import { isWegweiserData, parseDistance } from '$lib/wegweiser';
import type { WegweiserData } from '$lib/wegweiser';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type SaveDraftPayload = {
  titel?: unknown;
  wegweiser?: unknown;
};

function buildDraftTitle(title: string, wegweiser: WegweiserData): string {
  const normalizedTitle = title.trim();

  if (normalizedTitle) {
    return normalizedTitle;
  }

  const fallbackParts = [wegweiser.farDestination.trim(), wegweiser.nearDestination.trim()].filter(Boolean);
  return fallbackParts.length ? fallbackParts.join(' / ') : 'Neuer Wegweiser-Entwurf';
}

export const POST: RequestHandler = async ({ request }) => {
  let payload: SaveDraftPayload;

  try {
    payload = (await request.json()) as SaveDraftPayload;
  } catch {
    return json({ message: 'Ungueltiges JSON im Request-Body.' }, { status: 400 });
  }

  if (!isWegweiserData(payload.wegweiser)) {
    return json({ message: 'Die Wegweiser-Konfiguration ist unvollstaendig.' }, { status: 400 });
  }

  const pb = await createPocketBaseAdminClient().catch((error) => {
    console.error('PocketBase-Admin-Authentifizierung fehlgeschlagen.', error);
    return null;
  });

  if (!pb) {
    return json(
      {
        message:
          'PocketBase-Admin-Zugang ist nicht konfiguriert oder aktuell nicht erreichbar. Der Entwurf konnte nicht gespeichert werden.'
      },
      { status: 500 }
    );
  }

  const wegweiser = payload.wegweiser;
  const titel = buildDraftTitle(typeof payload.titel === 'string' ? payload.titel : '', wegweiser);

  const recordData = {
    titel,
    wegweiser_typ: 'arrow',
    richtung: wegweiser.direction,
    ziel_oben_text: wegweiser.farDestination.trim(),
    ziel_oben_entfernung: parseDistance(wegweiser.farDistance),
    ziel_unten_text: wegweiser.nearDestination.trim(),
    ziel_unten_entfernung: parseDistance(wegweiser.nearDistance),
    json_konfiguration: wegweiser
  };

  try {
    console.log(recordData);
    const record = await pb.collection('wegweiser_entwuerfe').create(recordData);

    return json({
      id: record.id,
      message: 'Entwurf wurde gespeichert.'
    });
  } catch (error) {
    console.error('Entwurf konnte nicht in PocketBase gespeichert werden.', error);

    return json(
      { message: 'Der Entwurf konnte serverseitig nicht gespeichert werden.' },
      { status: 500 }
    );
  }
};
