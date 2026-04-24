import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.request.method === 'POST') {
    console.log('POST request diagnostics', {
      routeId: event.route.id ?? 'unknown',
      origin: event.url.origin,
      href: event.url.href,
      requestOrigin: event.request.headers.get('origin'),
      host: event.request.headers.get('host'),
      forwardedHost: event.request.headers.get('x-forwarded-host'),
      forwardedProto: event.request.headers.get('x-forwarded-proto'),
      forwardedPort: event.request.headers.get('x-forwarded-port')
    });
  }

  return await resolve(event);
};
