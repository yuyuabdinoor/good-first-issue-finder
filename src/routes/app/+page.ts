import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { QueryMode } from '$lib/query-builder';
import { makeIssueQueryKey } from '$lib/query-builder';
import { fetchIssuesLoad } from '$lib/data';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { username, queryClient } = await parent();
  if (!username) {
    throw redirect(307, '/login');
  }

  let globalParam = false;
  try {
    globalParam = JSON.parse(url.searchParams.get('global') as string);
  } catch {
    globalParam = false;
  }

  const mode: QueryMode = globalParam ? 'global' : 'org';

  // makeIssueQueryKey with default '' args matches the initial client state in
  // +page.svelte exactly — TanStack Query reuses the prefetched data on hydration.
  await queryClient.prefetchQuery({
    queryKey: makeIssueQueryKey(globalParam),
    queryFn: () => fetchIssuesLoad(mode, fetch),
  });

  return {
    checked: globalParam,
  };
};
