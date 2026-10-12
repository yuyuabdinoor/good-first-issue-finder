/**
 * Pure helpers for composing GitHub Issues search query strings.
 *
 * No imports — free of JSON/config dependencies so it can be tested with
 * plain Node without any bundler or path-alias resolution.
 */

/** The two supported query modes, matching constants.json keys. */
export type QueryMode = 'org' | 'global';

/** Shape of the `query` object from constants.json. */
export type QueryConstants = { org: string; global: string };

/**
 * Canonical TanStack Query key for the issues infinite query.
 *
 * Used by both +page.ts (prefetch) and +page.svelte (createInfiniteQuery)
 * so the SSR-prefetched cache is reused on the client without a re-fetch.
 *
 * titleSearch and language default to '' — the empty-string defaults must
 * match the initial state in +page.svelte exactly.
 */
export function makeIssueQueryKey(
  global: boolean,
  titleSearch = '',
  language = '',
): readonly [string, { global: boolean; titleSearch: string; language: string }] {
  return ['issues', { global, titleSearch, language }] as const;
}

/**
 * Validates a client-supplied mode token and returns the corresponding
 * base query string from the supplied constants, or null when the token is
 * unrecognised.
 *
 * constants.json is the single source of truth for the base strings.
 * +server.ts imports it and passes the `query` object here.
 * Tests pass a fixture object — no file I/O required.
 */
export function resolveMode(mode: string, queries: QueryConstants): string | null {
  if (mode === 'org') return queries.org;
  if (mode === 'global') return queries.global;
  return null;
}

/**
 * Allowlisted programming languages for the language filter.
 * Values match GitHub's `language:` qualifier exactly (case-insensitive on
 * GitHub's side, but we normalise to the canonical casing here).
 */
export const ALLOWED_LANGUAGES = [
  'C',
  'C#',
  'C++',
  'CSS',
  'Dart',
  'Dockerfile',
  'Elixir',
  'Elm',
  'Go',
  'GraphQL',
  'Haskell',
  'HTML',
  'Java',
  'JavaScript',
  'Jupyter Notebook',
  'Kotlin',
  'Lua',
  'Nix',
  'OCaml',
  'PHP',
  'PowerShell',
  'Python',
  'R',
  'Ruby',
  'Rust',
  'Scala',
  'Shell',
  'Swift',
  'TypeScript',
  'Vue',
  'Zig',
] as const;

export type AllowedLanguage = (typeof ALLOWED_LANGUAGES)[number];

/**
 * Sanitises a free-text title search term so it cannot inject GitHub query
 * qualifiers.  We allow only alphanumeric characters, spaces, hyphens, dots,
 * underscores, and apostrophes — everything else is stripped.  The result is
 * then trimmed and truncated to 100 characters to prevent abuse.
 */
export function sanitiseTitleSearch(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9 '\-_.]/g, '')
    .trim()
    .slice(0, 100);
}

/**
 * Returns `language` if it is in the allowlist (case-insensitive lookup),
 * otherwise returns `null`.
 */
export function validateLanguage(language: string): AllowedLanguage | null {
  const match = ALLOWED_LANGUAGES.find((l) => l.toLowerCase() === language.trim().toLowerCase());
  return match ?? null;
}

/**
 * Builds the full GitHub search query string.
 *
 * @param baseQuery  The fixed eligibility query from constants (org or global).
 *                   Callers are responsible for supplying a trusted value.
 * @param titleSearch  Optional free-text title search from the user.
 * @param language  Optional programming language from the allowlist.
 * @returns  The composed query string ready to pass to GitHub's search API.
 */
export function buildQuery(baseQuery: string, titleSearch?: string, language?: string): string {
  let q = baseQuery;

  if (titleSearch) {
    const safe = sanitiseTitleSearch(titleSearch);
    if (safe.length > 0) {
      // Wrap in quotes so multi-word searches work as a phrase on GitHub
      q += ` "${safe}" in:title`;
    }
  }

  if (language) {
    const valid = validateLanguage(language);
    if (valid !== null) {
      // Quote languages that contain spaces (e.g. "Jupyter Notebook")
      q += ` language:"${valid}"`;
    }
  }

  return q;
}
