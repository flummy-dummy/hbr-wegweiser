import { createDraftRecordData, parseDraftPayload } from '$lib/server/draft-record';
import { gradZuHimmelsrichtung, normalizeHimmelsrichtungGrad } from '$lib/utils/himmelsrichtung';
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

  if (
    payload &&
    typeof payload === 'object' &&
    'darstellungs_abstand' in payload &&
    'seitlicher_versatz' in payload &&
    !('wegweiser' in (payload as Record<string, unknown>))
  ) {
    const rawDistance = Number((payload as { darstellungs_abstand?: unknown }).darstellungs_abstand);
    const rawSideOffset = Number((payload as { seitlicher_versatz?: unknown }).seitlicher_versatz);
    const normalizedDistance = Number.isFinite(rawDistance) ? Math.max(Math.trunc(rawDistance), 0) : 0;
    const normalizedSideOffset = Number.isFinite(rawSideOffset) ? Math.trunc(rawSideOffset) : 0;

    const pb = locals.pb;

    if (!pb) {
      return json(
        {
          message:
            'PocketBase-Admin-Zugang ist nicht konfiguriert oder aktuell nicht erreichbar. Die Position konnte nicht aktualisiert werden.'
        },
        { status: 500 }
      );
    }

    try {
      const record = await pb.collection('wegweiser_entwuerfe').update(id, {
        darstellungs_abstand: normalizedDistance,
        seitlicher_versatz: normalizedSideOffset
      });

      return json({
        id: record.id,
        message: 'Position wurde aktualisiert.'
      });
    } catch (error) {
      console.error('Wegweiser-Position konnte nicht in PocketBase aktualisiert werden.', error);

      return json(
        { message: 'Die Wegweiser-Position konnte serverseitig nicht aktualisiert werden.' },
        { status: 500 }
      );
    }
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'himmelsrichtung_grad' in payload &&
    !('wegweiser' in (payload as Record<string, unknown>))
  ) {
    const pb = locals.pb;

    if (!pb) {
      return json(
        {
          message:
            'PocketBase-Admin-Zugang ist nicht konfiguriert oder aktuell nicht erreichbar. Die Richtung konnte nicht aktualisiert werden.'
        },
        { status: 500 }
      );
    }

    try {
      const grad = normalizeHimmelsrichtungGrad((payload as { himmelsrichtung_grad?: unknown }).himmelsrichtung_grad);
      const record = await pb.collection('wegweiser_entwuerfe').update(id, {
        himmelsrichtung_grad: grad,
        himmelsrichtung_text: gradZuHimmelsrichtung(grad),
        himmelsrichtung_select: gradZuHimmelsrichtung(grad)
      });

      return json({
        id: record.id,
        message: 'Richtung wurde aktualisiert.'
      });
    } catch (error) {
      console.error('Wegweiser-Richtung konnte nicht in PocketBase aktualisiert werden.', error);

      return json(
        { message: 'Die Wegweiser-Richtung konnte serverseitig nicht aktualisiert werden.' },
        { status: 500 }
      );
    }
  }

  const parsedPayload = parseDraftPayload((payload ?? {}) as {
    titel?: unknown;
    wegweiser?: unknown;
    wegweiser_nr?: unknown;
    offizielle_wegweiser_nr?: unknown;
    kataster_wegweiser_nr?: unknown;
    pfosten?: unknown;
    status?: unknown;
  });

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

  try {
    const recordData = createDraftRecordData(parsedPayload.titel, parsedPayload.wegweiser, parsedPayload.meta);
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
