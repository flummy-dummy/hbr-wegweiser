import { loadKatasterMapData } from '$lib/server/kataster';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return await loadKatasterMapData();
};
