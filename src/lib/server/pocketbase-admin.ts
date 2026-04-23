import { env } from '$env/dynamic/private';

// Dieses Modul darf nur serverseitig verwendet werden.
// Private PocketBase-Zugangsdaten dürfen niemals in Client-Code importiert werden.

let didWarnAboutPocketBaseAdminCredentials = false;

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
