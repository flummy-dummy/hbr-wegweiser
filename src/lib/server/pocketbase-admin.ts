import { env } from '$env/dynamic/private';
import PocketBase from 'pocketbase';
import { getPocketBaseBaseUrl } from '$lib/server/pocketbase';

// Dieses Modul darf nur serverseitig verwendet werden.
// Private PocketBase-Zugangsdaten dürfen niemals in Client-Code importiert werden.

let didWarnAboutPocketBaseAdminCredentials = false;
let didWarnAboutPocketBaseBaseUrl = false;

export type PocketBaseAdminCredentials = {
  email: string;
  password: string;
};

export function getPocketBaseAdminCredentials(): PocketBaseAdminCredentials | null {
  const email = env.POCKETBASE_ADMIN_EMAIL?.trim();
  const password = env.POCKETBASE_ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    if (!didWarnAboutPocketBaseAdminCredentials) {
      didWarnAboutPocketBaseAdminCredentials = true;
      console.warn(
        'POCKETBASE_ADMIN_EMAIL oder POCKETBASE_ADMIN_PASSWORD ist nicht gesetzt. Serverseitige PocketBase-Schreibzugriffe sind noch nicht konfiguriert.'
      );
    }

    return null;
  }

  return {
    email,
    password
  };
}

export function hasPocketBaseAdminCredentials(): boolean {
  return getPocketBaseAdminCredentials() !== null;
}

export async function createPocketBaseAdminClient(): Promise<PocketBase | null> {
  const baseUrl = getPocketBaseBaseUrl();
  const credentials = getPocketBaseAdminCredentials();

  if (!baseUrl) {
    if (!didWarnAboutPocketBaseBaseUrl) {
      didWarnAboutPocketBaseBaseUrl = true;
      console.warn(
        'PUBLIC_POCKETBASE_URL ist nicht gesetzt. Serverseitige PocketBase-Authentifizierung kann nicht initialisiert werden.'
      );
    }

    return null;
  }

  if (!credentials) {
    return null;
  }

  const pb = new PocketBase(baseUrl);
  await pb.collection('_superusers').authWithPassword(credentials.email, credentials.password);

  return pb;
}
