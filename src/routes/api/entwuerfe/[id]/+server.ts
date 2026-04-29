import { createDraftRecordData, parseDraftPayload } from '$lib/server/draft-record';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const id = params.id?.trim();

  if (!id) {
    return json({ message: 'Es wurde keine Entwurfs-ID uebergeben.' }, { status: 400 });
  }

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

  const pb = locals.pb;

  if (!pb) {
    return json(
      {
        message:
          'PocketBase-Admin-Zugang ist nicht konfiguriert oder aktuell nicht erreichbar. Der Entwurf konnte nicht aktualisiert werden.'
      },
      { status: 500 }
    );
  }

  const recordData = createDraftRecordData(parsedPayload.titel, parsedPayload.wegweiser);

  try {
    console.log({ id, ...recordData });
    const record = await pb.collection('wegweiser_entwuerfe').update(id, recordData);

    return json({
      id: record.id,
      message: 'Bestehender Entwurf wurde aktualisiert.'
    });
  } catch (error) {
    console.error('Entwurf konnte nicht in PocketBase aktualisiert werden.', error);

    return json(
      { message: 'Der bestehende Entwurf konnte serverseitig nicht aktualisiert werden.' },
      { status: 500 }
    );
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const id = params.id?.trim();

  if (!id) {
    return json({ message: 'Es wurde keine Entwurfs-ID uebergeben.' }, { status: 400 });
  }

  const pb = locals.pb;

  if (!pb) {
    return json(
      {
        message:
          'PocketBase-Admin-Zugang ist nicht konfiguriert oder aktuell nicht erreichbar. Der Entwurf konnte nicht geloescht werden.'
      },
      { status: 500 }
    );
  }

  try {
    await pb.collection('wegweiser_entwuerfe').delete(id);

    return json({
      id,
      message: 'Entwurf wurde geloescht.'
    });
  } catch (error) {
    console.error('Entwurf konnte nicht in PocketBase geloescht werden.', error);

    return json(
      { message: 'Der Entwurf konnte serverseitig nicht geloescht werden.' },
      { status: 500 }
    );
  }
};
