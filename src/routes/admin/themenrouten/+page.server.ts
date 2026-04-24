import { createPocketBaseAdminClient } from '$lib/server/pocketbase-admin';
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

export const load: PageServerLoad = async () => {
  const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
    console.error('PocketBase-Admin-Zugang fuer Themenrouten konnte nicht initialisiert werden.', error);
    return null;
  });

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
  create: async ({ request }) => {
    const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
      console.error('PocketBase-Admin-Authentifizierung fuer Themenrouten fehlgeschlagen.', error);
      return null;
    });

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'create',
        message: 'PocketBase-Admin-Zugang ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await request.formData();
    const name = formValue(values, 'name');
    const slug = formValue(values, 'slug');
    const kurzlabel = formValue(values, 'kurzlabel');
    const beschreibung = formValue(values, 'beschreibung');
    const sortierungRaw = formValue(values, 'sortierung');
    const aktiv = values.get('aktiv') === 'on';
    const datei = values.get('datei');

    if (!name || !slug || !kurzlabel) {
      return fail(400, {
        success: false,
        action: 'create',
        message: 'Name, Slug und Kurzlabel sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    if (!(datei instanceof File) || !datei.size) {
      return fail(400, {
        success: false,
        action: 'create',
        message: 'Bitte eine SVG- oder PNG-Datei auswaehlen.',
        values: Object.fromEntries(values)
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
        values: Object.fromEntries(values)
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
          values: Object.fromEntries(values)
        });
      }
    }

    const payload = new FormData();
    payload.set('name', name);
    payload.set('slug', slug);
    payload.set('kurzlabel', kurzlabel);
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

      return fail(500, {
        success: false,
        action: 'create',
        message: 'Themenroute konnte nicht gespeichert werden.',
        values: Object.fromEntries(values)
      });
    }
  },

  update: async ({ request }) => {
    const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
      console.error('PocketBase-Admin-Authentifizierung fuer Themenrouten fehlgeschlagen.', error);
      return null;
    });

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'update',
        message: 'PocketBase-Admin-Zugang ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await request.formData();
    const id = formValue(values, 'id');
    const name = formValue(values, 'name');
    const slug = formValue(values, 'slug');
    const kurzlabel = formValue(values, 'kurzlabel');
    const beschreibung = formValue(values, 'beschreibung');
    const sortierungRaw = formValue(values, 'sortierung');
    const aktiv = values.get('aktiv') === 'on';
    const datei = values.get('datei');

    if (!id || !name || !slug || !kurzlabel) {
      return fail(400, {
        success: false,
        action: 'update',
        message: 'ID, Name, Slug und Kurzlabel sind erforderlich.',
        values: Object.fromEntries(values)
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
          values: Object.fromEntries(values)
        });
      }
    }

    const payload = new FormData();
    payload.set('name', name);
    payload.set('slug', slug);
    payload.set('kurzlabel', kurzlabel);
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
          values: Object.fromEntries(values)
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

      return fail(500, {
        success: false,
        action: 'update',
        message: 'Themenroute konnte nicht aktualisiert werden.',
        values: Object.fromEntries(values)
      });
    }
  },

  delete: async ({ request }) => {
    const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
      console.error('PocketBase-Admin-Authentifizierung fuer Themenrouten fehlgeschlagen.', error);
      return null;
    });

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'delete',
        message: 'PocketBase-Admin-Zugang ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await request.formData();
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
