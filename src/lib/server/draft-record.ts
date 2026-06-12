import { isWegweiserData, parseDistance } from '$lib/wegweiser';
import type { WegweiserData, WegweiserStatus } from '$lib/wegweiser';
import { gradZuHimmelsrichtung, normalizeHimmelsrichtungGrad } from '$lib/utils/himmelsrichtung';

export type SaveDraftPayload = {
  titel?: unknown;
  wegweiser?: unknown;
  wegweiser_nr?: unknown;
  offizielle_wegweiser_nr?: unknown;
  kataster_wegweiser_nr?: unknown;
  pfosten?: unknown;
  status?: unknown;
};

export type DraftMeta = {
  wegweiser_nr?: string;
  offizielle_wegweiser_nr?: string;
  kataster_wegweiser_nr?: string;
  pfosten?: string;
  status?: WegweiserStatus;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalStatus(value: unknown): WegweiserStatus | undefined {
  return value === 'entwurf' ||
    value === 'bestellt' ||
    value === 'produziert' ||
    value === 'montiert' ||
    value === 'entfernt'
    ? value
    : undefined;
}

export function buildDraftTitle(title: string, wegweiser: WegweiserData): string {
  const normalizedTitle = title.trim();

  if (normalizedTitle) {
    return normalizedTitle;
  }

  const fallbackParts = [wegweiser.farDestination.trim(), wegweiser.nearDestination.trim()].filter(Boolean);
  return fallbackParts.length ? fallbackParts.join(' / ') : 'Neuer Wegweiser-Entwurf';
}

export function parseDraftPayload(payload: SaveDraftPayload): { titel: string; wegweiser: WegweiserData; meta: DraftMeta } | null {
  if (!isWegweiserData(payload.wegweiser)) {
    return null;
  }

  const wegweiser = payload.wegweiser;

  return {
    titel: buildDraftTitle(typeof payload.titel === 'string' ? payload.titel : '', wegweiser),
    wegweiser,
    meta: {
      wegweiser_nr: optionalString(payload.wegweiser_nr),
      offizielle_wegweiser_nr: optionalString(payload.offizielle_wegweiser_nr),
      kataster_wegweiser_nr: optionalString(payload.kataster_wegweiser_nr),
      pfosten: optionalString(payload.pfosten),
      status: optionalStatus(payload.status)
    }
  };
}

export function createDraftRecordData(titel: string, wegweiser: WegweiserData, meta: DraftMeta = {}) {
  const himmelsrichtungGrad = normalizeHimmelsrichtungGrad(wegweiser.himmelsrichtungGrad);
  return {
    titel,
    wegweiser_nr: meta.wegweiser_nr ?? '',
    offizielle_wegweiser_nr: meta.offizielle_wegweiser_nr ?? '',
    kataster_wegweiser_nr: meta.kataster_wegweiser_nr ?? '',
    pfosten: meta.pfosten ?? '',
    status: meta.status ?? '',
    wegweiser_typ: 'arrow',
    richtung: wegweiser.direction,
    himmelsrichtung_grad: himmelsrichtungGrad,
    himmelsrichtung_text: gradZuHimmelsrichtung(himmelsrichtungGrad),
    ziel_oben_text: wegweiser.farDestination.trim(),
    ziel_oben_entfernung: parseDistance(wegweiser.farDistance),
    ziel_unten_text: wegweiser.nearDestination.trim(),
    ziel_unten_entfernung: parseDistance(wegweiser.nearDistance),
    json_konfiguration: wegweiser
  };
}
