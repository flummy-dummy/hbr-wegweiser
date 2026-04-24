import { createPocketBaseAdminClient } from '$lib/server/pocketbase-admin';
import { createDraftRecordData, parseDraftPayload } from '$lib/server/draft-record';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ message: 'Ungueltiges JSON im Request-Body.' }, { status: 400 });
  }

  const parsedPayload = parseDraftPayload((payload ?? {}) as { titel?: unknown; wegweiser?: unknown });

  if (!parsedPayload) {
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

  const recordData = createDraftRecordData(parsedPayload.titel, parsedPayload.wegweiser);

  try {
    const record = await pb.collection('wegweiser_entwuerfe').create(recordData);

    return json({
      id: record.id,
      message: 'Neuer Entwurf wurde gespeichert.'
    });
  } catch (error) {
    console.error('Entwurf konnte nicht in PocketBase gespeichert werden.', error);

    return json(
      { message: 'Der Entwurf konnte serverseitig nicht gespeichert werden.' },
      { status: 500 }
    );
  }
};
