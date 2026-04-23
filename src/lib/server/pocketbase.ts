import { env } from '$env/dynamic/public';
import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

let didWarnAboutPocketBaseUrl = false;

export function getPocketBaseBaseUrl(): string | null {
  const pocketBaseUrl = env.PUBLIC_POCKETBASE_URL?.trim();

  return pocketBaseUrl || null;
}

export function createPocketBaseClient(): PocketBase | null {
  const pocketBaseUrl = env.PUBLIC_POCKETBASE_URL?.trim();

  if (!pocketBaseUrl && !didWarnAboutPocketBaseUrl) {
    didWarnAboutPocketBaseUrl = true;
    console.warn(
      'PUBLIC_POCKETBASE_URL ist nicht gesetzt. PocketBase-Stammdaten werden nicht geladen.'
    );

    return null;
  }

  return new PocketBase(pocketBaseUrl);
}

export function getPocketBaseFileUrl(
  pb: PocketBase,
  record: RecordModel,
  fieldNames: string[]
): string | undefined {
  for (const fieldName of fieldNames) {
    const fileValue = record[fieldName];
    const filename = Array.isArray(fileValue) ? fileValue[0] : fileValue;

    if (typeof filename === 'string' && filename.trim()) {
      return pb.files.getURL(record, filename);
    }
  }

  return undefined;
}
