import { redirect } from '@sveltejs/kit';
import { clearPocketBaseAuthCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  clearPocketBaseAuthCookie(event, event.locals.pb);
  throw redirect(303, '/login');
};
