import { isWegweiserData, parseDistance } from '$lib/wegweiser';
import type { WegweiserData } from '$lib/wegweiser';

export type SaveDraftPayload = {
  titel?: unknown;
  wegweiser?: unknown;
};

export function buildDraftTitle(title: string, wegweiser: WegweiserData): string {
  const normalizedTitle = title.trim();

  if (normalizedTitle) {
    return normalizedTitle;
  }

  const fallbackParts = [wegweiser.farDestination.trim(), wegweiser.nearDestination.trim()].filter(Boolean);
  return fallbackParts.length ? fallbackParts.join(' / ') : 'Neuer Wegweiser-Entwurf';
}

export function parseDraftPayload(payload: SaveDraftPayload): { titel: string; wegweiser: WegweiserData } | null {
  if (!isWegweiserData(payload.wegweiser)) {
    return null;
  }

  const wegweiser = payload.wegweiser;

  return {
    titel: buildDraftTitle(typeof payload.titel === 'string' ? payload.titel : '', wegweiser),
    wegweiser
  };
}

export function createDraftRecordData(titel: string, wegweiser: WegweiserData) {
  return {
    titel,
    wegweiser_typ: 'arrow',
    richtung: wegweiser.direction,
    ziel_oben_text: wegweiser.farDestination.trim(),
    ziel_oben_entfernung: parseDistance(wegweiser.farDistance),
    ziel_unten_text: wegweiser.nearDestination.trim(),
    ziel_unten_entfernung: parseDistance(wegweiser.nearDistance),
    json_konfiguration: wegweiser
  };
}
