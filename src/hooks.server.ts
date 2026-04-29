import { error, redirect, type Handle } from '@sveltejs/kit';
import {
  buildAuthState,
  buildLoginRedirectPath,
  clearPocketBaseAuthCookie,
  createPocketBaseServerClient,
  getPocketBaseAuthCollectionName,
  loadPocketBaseAuthFromCookies,
  persistPocketBaseAuthCookie
} from '$lib/server/auth';

function isProtectedReadPath(pathname: string): boolean {
  return pathname.startsWith('/kataster/karte') || pathname.startsWith('/editor');
}

function isProtectedEditApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/entwuerfe');
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin');
}

export const handle: Handle = async ({ event, resolve }) => {
  const pb = createPocketBaseServerClient();
  let shouldPersistAuthCookie = false;
  let shouldClearAuthCookie = false;

  if (pb) {
    loadPocketBaseAuthFromCookies(event, pb);

    if (pb.authStore.isValid) {
      try {
        await pb.collection(getPocketBaseAuthCollectionName()).authRefresh();
        shouldPersistAuthCookie = true;
      } catch {
        clearPocketBaseAuthCookie(event, pb);
        shouldClearAuthCookie = true;
      }
    }
  }

  event.locals.pb = pb;
  event.locals.auth = buildAuthState(pb);

  const { pathname } = event.url;

  if (pathname === '/login' && event.locals.auth.isAuthenticated) {
    throw redirect(303, '/kataster/karte');
  }

  if (isProtectedReadPath(pathname) && !event.locals.auth.isAuthenticated) {
    throw redirect(303, buildLoginRedirectPath(event.url));
  }

  if (isProtectedEditApiPath(pathname)) {
    if (!event.locals.auth.isAuthenticated) {
      throw error(401, 'Login erforderlich.');
    }

    if (!event.locals.auth.canEdit) {
      throw error(403, 'Du hast keine Berechtigung fuer diesen Zugriff.');
    }
  }

  if (isAdminPath(pathname)) {
    if (!event.locals.auth.isAuthenticated) {
      throw redirect(303, buildLoginRedirectPath(event.url));
    }

    if (!event.locals.auth.canEdit) {
      throw error(403, 'Dieser Bereich ist nur fuer Bearbeitung oder Administratoren freigegeben.');
    }
  }

  if (pb && !shouldClearAuthCookie && shouldPersistAuthCookie && pb.authStore.isValid) {
    persistPocketBaseAuthCookie(event, pb);
  }

  return resolve(event);
};
