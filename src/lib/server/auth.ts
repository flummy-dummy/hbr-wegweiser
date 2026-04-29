import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import type { RequestEvent } from '@sveltejs/kit';
import { getPocketBaseBaseUrl } from '$lib/server/pocketbase';

export const AUTH_COOKIE_NAME = 'pb_auth';

export type AppRole = 'admin' | 'bearbeitung' | 'lesen';

export type AppAuthUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole | null;
};

export type AppAuthState = {
  isAuthenticated: boolean;
  user: AppAuthUser | null;
  role: AppRole | null;
  canRead: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageAdmin: boolean;
};

export function getPocketBaseAuthCollectionName(): string {
  return env.POCKETBASE_AUTH_COLLECTION?.trim() || 'users';
}

export function createPocketBaseServerClient(): PocketBase | null {
  const baseUrl = getPocketBaseBaseUrl();
  return baseUrl ? new PocketBase(baseUrl) : null;
}

export function normalizeRole(value: unknown): AppRole | null {
  return value === 'admin' || value === 'bearbeitung' || value === 'lesen' ? value : null;
}

export function buildAuthState(pb: PocketBase | null): AppAuthState {
  const model = pb?.authStore.record;
  const role = normalizeRole(model?.get?.('rolle') ?? model?.rolle);
  const isAuthenticated = Boolean(pb?.authStore.isValid && model);
  const canRead = isAuthenticated;
  const canEdit = role === 'admin' || role === 'bearbeitung';
  const canDelete = role === 'admin' || role === 'bearbeitung';
  const canManageAdmin = role === 'admin';

  return {
    isAuthenticated,
    role,
    canRead,
    canEdit,
    canDelete,
    canManageAdmin,
    user: isAuthenticated
      ? {
          id: String(model?.id ?? ''),
          email:
            typeof model?.email === 'string' && model.email.trim()
              ? model.email.trim()
              : '',
          name:
            typeof model?.name === 'string' && model.name.trim()
              ? model.name.trim()
              : typeof model?.username === 'string' && model.username.trim()
                ? model.username.trim()
                : typeof model?.email === 'string'
                  ? model.email.trim()
                  : 'Unbekannt',
          role
        }
      : null
  };
}

export function loadPocketBaseAuthFromCookies(event: RequestEvent, pb: PocketBase) {
  const authToken = event.cookies.get(AUTH_COOKIE_NAME);

  if (authToken) {
    pb.authStore.save(authToken, null);
  }
}

export function persistPocketBaseAuthCookie(event: RequestEvent, pb: PocketBase) {
  event.cookies.set(AUTH_COOKIE_NAME, pb.authStore.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 60 * 60 * 24 * 7
  });
}

export function clearPocketBaseAuthCookie(event: RequestEvent, pb?: PocketBase | null) {
  pb?.authStore.clear();
  event.cookies.delete(AUTH_COOKIE_NAME, {
    path: '/'
  });
}

export function buildLoginRedirectPath(url: URL): string {
  const next = `${url.pathname}${url.search}`;
  return `/login?redirectTo=${encodeURIComponent(next)}`;
}

export function ensurePermission(event: RequestEvent, permission: 'read' | 'edit' | 'delete') {
  const auth = event.locals.auth;

  if (!auth.isAuthenticated) {
    throw redirect(303, buildLoginRedirectPath(event.url));
  }

  const allowed =
    permission === 'read'
      ? auth.canRead
      : permission === 'edit'
        ? auth.canEdit
        : auth.canDelete;

  if (!allowed) {
    throw error(403, 'Du hast keine Berechtigung fuer diese Aktion.');
  }
}

export function getSafeRedirectTarget(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/kataster/karte';
  }

  return value;
}
