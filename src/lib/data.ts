import type { SearchResponse } from '../global';
import type { QueryMode } from './query-builder';

const url = '/api/get-issues';

export async function fetchIssuesLoad(mode: QueryMode, loadFetch: typeof window.fetch) {
  const response = await loadFetch(url, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  const data = await response.json();
  return data as SearchResponse;
}

export async function fetchIssues(
  mode: QueryMode,
  endCursor: string,
  titleSearch?: string,
  language?: string,
) {
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ mode, after: endCursor, titleSearch, language }),
  });
  const data = await response.json();
  return data as SearchResponse;
}
