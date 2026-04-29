import { ensurePermission } from '$lib/server/auth';
import { getPocketBaseFileUrl } from '$lib/server/pocketbase';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

type ThemenrouteAdminItem = {
  id: string;
  name: string;
  kurzlabel: string;
  slug: string;
  status: string;
  beschreibung: string;
  aktiv: boolean;
  sortierung: number | null;
  imageUrl?: string;
  imageType: 'svg' | 'png' | null;
};

function stringField(record: RecordModel, fields: string[], fallback = ''): string {
  for (const field of fields) {
    const value = record[field];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function booleanField(record: RecordModel, field: string): boolean {
  return record[field] === true;
}

function numberField(record: RecordModel, field: string): number | null {
  const value = record[field];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function hasFileValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' && value[0].trim().length > 0;
  }

  return typeof value === 'string' && value.trim().length > 0;
}

function mapThemenroute(pb: PocketBase, record: RecordModel): ThemenrouteAdminItem {
  const hasSvg = hasFileValue(record.svg_datei);
  const hasPng = hasFileValue(record.png_datei);

  return {
    id: String(record.id ?? ''),
    name: stringField(record, ['name'], 'Ohne Namen'),
    kurzlabel: stringField(record, ['kurzlabel']),
    slug: stringField(record, ['slug']),
    status: stringField(record, ['status'], 'aktiv'),
    beschreibung: stringField(record, ['beschreibung']),
    aktiv: booleanField(record, 'aktiv'),
    sortierung: numberField(record, 'sortierung'),
    imageUrl: getPocketBaseFileUrl(pb, record, ['svg_datei', 'png_datei']),
    imageType: hasSvg ? 'svg' : hasPng ? 'png' : null
  };
}

function formValue(values: FormData, field: string): string {
  const value = values.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function isValidThemenrouteStatus(value: string): boolean {
  return value === 'aktiv' || value === 'planung' || value === 'eingestellt';
}

function pocketBaseErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: Record<string, { message?: string }>; message?: string } })
      .response;

    const fieldMessages = Object.entries(response?.data ?? {})
      .map(([field, details]) => {
        const message = details?.message;
        return typeof message === 'string' && message.trim() ? `${field}: ${message}` : null;
      })
      .filter((value): value is string => Boolean(value));

    if (fieldMessages.length) {
      return fieldMessages.join(' ');
    }

    if (typeof response?.message === 'string' && response.message.trim()) {
      return response.message;
    }
  }

  return fallback;
}

function serializableFormValues(values: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(
    Array.from(values.entries()).map(([key, value]) => [
      key,
      value instanceof File ? value.name : value
    ])
  );
}

export const load: PageServerLoad = async ({ locals }) => {
  const pbAdmin = locals.pb;

  if (!pbAdmin) {
    return {
      themenrouten: [] satisfies ThemenrouteAdminItem[],
      pocketBaseWarning:
        'PocketBase ist nicht vollstaendig konfiguriert. Setze PUBLIC_POCKETBASE_URL sowie die Admin-Zugangsdaten, damit Themenrouten verwaltet werden koennen.'
    };
  }

  try {
    const themenrouten = await pbAdmin.collection('themenrouten').getFullList<RecordModel>({
      sort: 'sortierung,name'
    });

    return {
      themenrouten: themenrouten.map((record) => mapThemenroute(pbAdmin, record)),
      pocketBaseWarning: null
    };
  } catch (error) {
    console.error('Themenrouten konnten nicht geladen werden.', error);

    return {
      themenrouten: [] satisfies ThemenrouteAdminItem[],
      pocketBaseWarning: 'Themenrouten konnten nicht geladen werden.'
    };
  }
};

export const actions: Actions = {
  create: async (event) => {
    ensurePermission(event, 'edit');
    const pbAdmin = event.locals.pb;

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'create',
        message: 'PocketBase ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await event.request.formData();
    const name = formValue(values, 'name');
    const slug = formValue(values, 'slug');
    const kurzlabel = formValue(values, 'kurzlabel');
    const status = formValue(values, 'status');
    const beschreibung = formValue(values, 'beschreibung');
    const sortierungRaw = formValue(values, 'sortierung');
    const aktiv = values.get('aktiv') === 'on';
    const datei = values.get('datei');

    if (!name || !slug || !kurzlabel || !status) {
      return fail(400, {
        success: false,
        action: 'create',
        message: 'Name, Slug, Kurzlabel und Status sind erforderlich.',
        values: serializableFormValues(values)
      });
    }

    if (!isValidThemenrouteStatus(status)) {
      return fail(400, {
        success: false,
        action: 'create',
        message: 'Status muss aktiv, planung oder eingestellt sein.',
        values: serializableFormValues(values)
      });
    }

    if (!(datei instanceof File) || !datei.size) {
      return fail(400, {
        success: false,
        action: 'create',
        message: 'Bitte eine SVG- oder PNG-Datei auswaehlen.',
        values: serializableFormValues(values)
      });
    }

    const lowerName = datei.name.toLowerCase();
    const lowerType = datei.type.toLowerCase();
    const isSvg = lowerType === 'image/svg+xml' || lowerName.endsWith('.svg');
    const isPng = lowerType === 'image/png' || lowerName.endsWith('.png');

    if (!isSvg && !isPng) {
      return fail(400, {
        success: false,
        action: 'create',
        message: 'Es werden nur SVG- und PNG-Dateien unterstuetzt.',
        values: serializableFormValues(values)
      });
    }

    let sortierung: number | null = null;

    if (sortierungRaw) {
      sortierung = Number(sortierungRaw);

      if (!Number.isFinite(sortierung)) {
        return fail(400, {
          success: false,
          action: 'create',
          message: 'Sortierung muss eine gueltige Zahl sein.',
          values: serializableFormValues(values)
        });
      }
    }

    const payload = new FormData();
    payload.set('name', name);
    payload.set('slug', slug);
    payload.set('kurzlabel', kurzlabel);
    payload.set('status', status);
    payload.set('beschreibung', beschreibung);
    payload.set('aktiv', aktiv ? 'true' : 'false');

    if (sortierung !== null) {
      payload.set('sortierung', String(sortierung));
    }

    payload.set(isSvg ? 'svg_datei' : 'png_datei', datei, datei.name);

    try {
      await pbAdmin.collection('themenrouten').create(payload);

      return {
        success: true,
        action: 'create',
        message: 'Themenroute wurde gespeichert.'
      };
    } catch (error) {
      console.error('Themenroute konnte nicht gespeichert werden.', error);

      return fail(400, {
        success: false,
        action: 'create',
        message: pocketBaseErrorMessage(error, 'Themenroute konnte nicht gespeichert werden.'),
        values: serializableFormValues(values)
      });
    }
  },

  update: async (event) => {
    ensurePermission(event, 'edit');
    const pbAdmin = event.locals.pb;

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'update',
        message: 'PocketBase ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await event.request.formData();
    const id = formValue(values, 'id');
    const name = formValue(values, 'name');
    const slug = formValue(values, 'slug');
    const kurzlabel = formValue(values, 'kurzlabel');
    const status = formValue(values, 'status');
    const beschreibung = formValue(values, 'beschreibung');
    const sortierungRaw = formValue(values, 'sortierung');
    const aktiv = values.get('aktiv') === 'on';
    const datei = values.get('datei');

    if (!id || !name || !slug || !kurzlabel || !status) {
      return fail(400, {
        success: false,
        action: 'update',
        message: 'ID, Name, Slug, Kurzlabel und Status sind erforderlich.',
        values: serializableFormValues(values)
      });
    }

    if (!isValidThemenrouteStatus(status)) {
      return fail(400, {
        success: false,
        action: 'update',
        message: 'Status muss aktiv, planung oder eingestellt sein.',
        values: serializableFormValues(values)
      });
    }

    let sortierung: number | null = null;

    if (sortierungRaw) {
      sortierung = Number(sortierungRaw);

      if (!Number.isFinite(sortierung)) {
        return fail(400, {
          success: false,
          action: 'update',
          message: 'Sortierung muss eine gueltige Zahl sein.',
          values: serializableFormValues(values)
        });
      }
    }

    const payload = new FormData();
    payload.set('name', name);
    payload.set('slug', slug);
    payload.set('kurzlabel', kurzlabel);
    payload.set('status', status);
    payload.set('beschreibung', beschreibung);
    payload.set('aktiv', aktiv ? 'true' : 'false');
    if (sortierung !== null) {
      payload.set('sortierung', String(sortierung));
    } else {
      payload.set('sortierung', '');
    }

    if (datei instanceof File && datei.size) {
      const lowerName = datei.name.toLowerCase();
      const lowerType = datei.type.toLowerCase();
      const isSvg = lowerType === 'image/svg+xml' || lowerName.endsWith('.svg');
      const isPng = lowerType === 'image/png' || lowerName.endsWith('.png');

      if (!isSvg && !isPng) {
        return fail(400, {
          success: false,
          action: 'update',
          message: 'Es werden nur SVG- und PNG-Dateien unterstuetzt.',
          values: serializableFormValues(values)
        });
      }

      payload.set(isSvg ? 'svg_datei' : 'png_datei', datei, datei.name);
      payload.set(isSvg ? 'png_datei' : 'svg_datei', '');
    }

    try {
      await pbAdmin.collection('themenrouten').update(id, payload);

      return {
        success: true,
        action: 'update',
        message: 'Themenroute wurde aktualisiert.'
      };
    } catch (error) {
      console.error('Themenroute konnte nicht aktualisiert werden.', error);

      return fail(400, {
        success: false,
        action: 'update',
        message: pocketBaseErrorMessage(error, 'Themenroute konnte nicht aktualisiert werden.'),
        values: serializableFormValues(values)
      });
    }
  },

  delete: async (event) => {
    ensurePermission(event, 'edit');
    const pbAdmin = event.locals.pb;

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'delete',
        message: 'PocketBase ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await event.request.formData();
    const id = formValue(values, 'id');

    if (!id) {
      return fail(400, {
        success: false,
        action: 'delete',
        message: 'Die Themenroute konnte nicht geloescht werden, weil die ID fehlt.'
      });
    }

    try {
      await pbAdmin.collection('themenrouten').delete(id);

      return {
        success: true,
        action: 'delete',
        message: 'Themenroute wurde geloescht.'
      };
    } catch (error) {
      console.error('Themenroute konnte nicht geloescht werden.', error);

      return fail(500, {
        success: false,
        action: 'delete',
        message: 'Themenroute konnte nicht geloescht werden.'
      });
    }
  }
};
