import { env } from '$env/dynamic/public';
import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

const fallbackPocketBaseUrl = 'https://pocketbase.holbes.de/';

export function createPocketBaseClient() {
  return new PocketBase(env.PUBLIC_POCKETBASE_URL ?? fallbackPocketBaseUrl);
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
