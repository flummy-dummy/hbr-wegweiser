import { fail, redirect } from '@sveltejs/kit';
import {
  createPocketBaseServerClient,
  getPocketBaseAuthCollectionName,
  getSafeRedirectTarget,
  persistPocketBaseAuthCookie
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

function formValue(values: FormData, field: string): string {
  const value = values.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

export const load: PageServerLoad = async ({ url }) => {
  return {
    redirectTo: getSafeRedirectTarget(url.searchParams.get('redirectTo'))
  };
};

export const actions: Actions = {
  default: async (event) => {
    const pb = createPocketBaseServerClient();

    if (!pb) {
      return fail(503, {
        success: false,
        message: 'PocketBase ist nicht konfiguriert oder aktuell nicht erreichbar.'
      });
    }

    const values = await event.request.formData();
    const email = formValue(values, 'email');
    const password = formValue(values, 'password');
    const redirectTo = getSafeRedirectTarget(formValue(values, 'redirectTo'));

    if (!email || !password) {
      return fail(400, {
        success: false,
        message: 'E-Mail und Passwort sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    try {
      await pb.collection(getPocketBaseAuthCollectionName()).authWithPassword(email, password);
      persistPocketBaseAuthCookie(event, pb);
    } catch (error) {
      console.error('PocketBase-Login fehlgeschlagen.', error);

      return fail(400, {
        success: false,
        message: 'Login fehlgeschlagen. Bitte pruefe E-Mail und Passwort.',
        values: Object.fromEntries(values)
      });
    }

    throw redirect(303, redirectTo);
  }
};
