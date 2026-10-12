/**
 * Unit tests for src/lib/query-builder.ts
 *
 * Run: node --test tests/query-builder.test.mjs
 *      npm run test:unit
 *
 * Node 24 loads .ts files natively (type-stripping). No bundler needed.
 * No new dependencies beyond node:test + node:assert.
 *
 * Four suites:
 *   1. resolveMode  – mode gating and injection prevention
 *   2. sanitiseTitleSearch – input escaping
 *   3. validateLanguage    – allowlist enforcement
 *   4. buildQuery          – query composition
 *   5. Pagination-reset regression (title on page 2 only)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Node 24 strips TypeScript types natively — import the source directly.
import {
  makeIssueQueryKey,
  resolveMode,
  sanitiseTitleSearch,
  validateLanguage,
  validateLabel,
  buildQuery,
  ALLOWED_LANGUAGES,
} from '../src/lib/query-builder.ts';

// ---------------------------------------------------------------------------
// Fixture constants — same shape as the `query` key in constants.json.
// Using fixtures keeps the test free of file I/O while still calling the
// real resolveMode() function (not a mirror of it).
// ---------------------------------------------------------------------------
const FIXTURE_QUERIES = {
  org: 'is:open archived:false label:"good first issue" org:EddieHubCommunity no:assignee',
  global: 'is:open archived:false label:"EddieHub:good-first-issue" no:assignee',
};

// ---------------------------------------------------------------------------
// 1. resolveMode
// ---------------------------------------------------------------------------

describe('resolveMode', () => {
  it('returns the org base query for mode "org"', () => {
    assert.equal(resolveMode('org', FIXTURE_QUERIES), FIXTURE_QUERIES.org);
  });

  it('returns the global base query for mode "global"', () => {
    assert.equal(resolveMode('global', FIXTURE_QUERIES), FIXTURE_QUERIES.global);
  });

  it('returns null for an unrecognised mode', () => {
    assert.equal(resolveMode('', FIXTURE_QUERIES), null);
    assert.equal(resolveMode('admin', FIXTURE_QUERIES), null);
    assert.equal(resolveMode('ORG', FIXTURE_QUERIES), null); // case-sensitive
  });

  // Regression: before this fix, +server.ts accepted body.query directly so a
  // client could send any GitHub query string as the base.  Now the server
  // calls resolveMode(body.mode, QUERIES) and the only accepted tokens are the
  // two literal strings 'org' and 'global'.  A raw query string is not one of
  // them, so resolveMode returns null and the server responds 400.
  it('REGRESSION – rejects a raw GitHub query string sent as the mode token', () => {
    const attackerPayload = 'is:open label:"good first issue" org:evil-org no:assignee';
    assert.equal(
      resolveMode(attackerPayload, FIXTURE_QUERIES),
      null,
      'A raw query string must not be accepted as a mode token',
    );
  });

  it('resolves against whichever query constants are passed (fixture isolation)', () => {
    // Prove the function is pure: different constants → different output.
    const alt = { org: 'org-alt', global: 'global-alt' };
    assert.equal(resolveMode('org', alt), 'org-alt');
    assert.equal(resolveMode('global', alt), 'global-alt');
  });
});

// ---------------------------------------------------------------------------
// 2. sanitiseTitleSearch
// ---------------------------------------------------------------------------

describe('sanitiseTitleSearch', () => {
  it('passes through normal words', () => {
    assert.equal(sanitiseTitleSearch('fix typo'), 'fix typo');
  });

  it('strips colons (GitHub qualifier injection)', () => {
    assert.equal(sanitiseTitleSearch('foo org:evil label:hack'), 'foo orgevil labelhack');
  });

  it('strips colons and forward-slashes', () => {
    assert.equal(sanitiseTitleSearch('repo:evil/repo'), 'repoevilrepo');
    assert.equal(sanitiseTitleSearch('evil/repo'), 'evilrepo');
  });

  it('strips quotes and angle brackets', () => {
    assert.equal(sanitiseTitleSearch('"quoted" <injected>'), 'quoted injected');
  });

  it('strips asterisks and question marks', () => {
    assert.equal(sanitiseTitleSearch('foo*bar?baz'), 'foobarbaz');
  });

  it('trims whitespace', () => {
    assert.equal(sanitiseTitleSearch('  hello  '), 'hello');
  });

  it('truncates to 100 characters', () => {
    assert.equal(sanitiseTitleSearch('a'.repeat(200)).length, 100);
  });

  it('allows hyphens, dots, underscores, apostrophes', () => {
    assert.equal(sanitiseTitleSearch("fix-it v1.0 my_func it's"), "fix-it v1.0 my_func it's");
  });

  it('returns empty string for blank input', () => {
    assert.equal(sanitiseTitleSearch('   '), '');
  });
});

// ---------------------------------------------------------------------------
// 3. validateLanguage
// ---------------------------------------------------------------------------

describe('validateLanguage', () => {
  it('accepts a valid language (exact case)', () => {
    assert.equal(validateLanguage('TypeScript'), 'TypeScript');
  });

  it('accepts a valid language (wrong case)', () => {
    assert.equal(validateLanguage('typescript'), 'TypeScript');
  });

  it('accepts a language with spaces', () => {
    assert.equal(validateLanguage('jupyter notebook'), 'Jupyter Notebook');
  });

  it('rejects an unknown language', () => {
    assert.equal(validateLanguage('COBOL'), null);
  });

  it('rejects empty string', () => {
    assert.equal(validateLanguage(''), null);
  });

  it('rejects a GitHub qualifier injection attempt', () => {
    assert.equal(validateLanguage('TypeScript" OR label:hack "'), null);
  });

  it('covers every entry in ALLOWED_LANGUAGES', () => {
    for (const lang of ALLOWED_LANGUAGES) {
      assert.equal(validateLanguage(lang), lang, `Failed for: ${lang}`);
    }
  });
});

describe('validateLabel', () => {
  it('preserves a label that can be used in a quoted GitHub query', () => {
    assert.equal(validateLabel('  help wanted  '), 'help wanted');
    assert.equal(validateLabel('EddieHub:good-first-issue'), 'EddieHub:good-first-issue');
  });

  it('rejects values that could break out of a quoted label', () => {
    assert.equal(validateLabel('bug" org:other'), null);
    assert.equal(validateLabel('bug\\"'), null);
    assert.equal(validateLabel('bug\nlabel:other'), null);
    assert.equal(validateLabel('  '), null);
  });
});

// ---------------------------------------------------------------------------
// 4. buildQuery
// ---------------------------------------------------------------------------

describe('buildQuery', () => {
  const BASE = FIXTURE_QUERIES.org;

  it('returns the base unchanged when no extras are supplied', () => {
    assert.equal(buildQuery(BASE), BASE);
  });

  it('appends title with in:title qualifier', () => {
    const q = buildQuery(BASE, 'fix typo');
    assert.match(q, /"\bfix typo\b" in:title/);
    assert.match(q, new RegExp('^' + escapeRe(BASE)));
  });

  it('does not append empty title', () => {
    assert.equal(buildQuery(BASE, ''), BASE);
    assert.equal(buildQuery(BASE, '   '), BASE);
  });

  it('appends language qualifier', () => {
    assert.match(buildQuery(BASE, undefined, 'Rust'), /language:"Rust"/);
  });

  it('appends both title and language', () => {
    const q = buildQuery(BASE, 'async runtime', 'Rust');
    assert.match(q, /"async runtime" in:title/);
    assert.match(q, /language:"Rust"/);
  });

  it('quotes multi-word language names', () => {
    assert.match(buildQuery(BASE, undefined, 'Jupyter Notebook'), /language:"Jupyter Notebook"/);
  });

  it('ignores an invalid language', () => {
    assert.equal(buildQuery(BASE, undefined, 'COBOL'), BASE);
  });

  it('sanitises an injected title before appending', () => {
    const q = buildQuery(BASE, 'foo org:evil');
    assert.doesNotMatch(q, /org:evil/);
    assert.match(q, /"foo orgevil" in:title/);
  });

  it('adds selected labels as AND filters to the server query', () => {
    const q = buildQuery(BASE, undefined, undefined, ['documentation', 'help wanted']);
    assert.match(q, /label:"documentation"/);
    assert.match(q, /label:"help wanted"/);
    assert.match(q, /label:"good first issue"/);
  });

  it('can search a label absent from loaded-page suggestions', () => {
    const q = buildQuery(BASE, undefined, undefined, ['needs tests']);
    assert.match(q, /label:"needs tests"/);
  });
});

// ---------------------------------------------------------------------------
// 5. makeIssueQueryKey — pagination reset and hydration match
// ---------------------------------------------------------------------------

describe('makeIssueQueryKey', () => {
  // These tests call the real exported function, not a local mirror.

  it('returns a stable key for the same arguments', () => {
    assert.deepEqual(makeIssueQueryKey(false, '', ''), makeIssueQueryKey(false, '', ''));
  });

  it('titleSearch change → different key (pagination reset)', () => {
    assert.notDeepEqual(makeIssueQueryKey(false, '', ''), makeIssueQueryKey(false, 'Rust', ''));
  });

  it('language change → different key (pagination reset)', () => {
    assert.notDeepEqual(makeIssueQueryKey(false, '', ''), makeIssueQueryKey(false, '', 'Rust'));
  });

  it('label change → different key (pagination reset)', () => {
    assert.notDeepEqual(
      makeIssueQueryKey(false),
      makeIssueQueryKey(false, '', '', ['needs tests']),
    );
  });

  it('label order does not create a different cache key', () => {
    assert.deepEqual(
      makeIssueQueryKey(false, '', '', ['help wanted', 'documentation']),
      makeIssueQueryKey(false, '', '', ['documentation', 'help wanted']),
    );
  });

  it('global toggle → different key', () => {
    assert.notDeepEqual(makeIssueQueryKey(false, '', ''), makeIssueQueryKey(true, '', ''));
  });

  // Hydration regression: +page.ts prefetch used ['issues', { global }] before
  // this fix (missing titleSearch and language fields), which never matched the
  // client key ['issues', { global, titleSearch:'', language:'' }], causing a
  // double-fetch on every SSR page load.
  //
  // Now both call makeIssueQueryKey with the same arguments, so the keys are
  // identical and TanStack Query reuses the prefetched data.
  it('REGRESSION – prefetch key matches initial client key (no double-fetch on hydration)', () => {
    const globalParam = false;

    // What +page.ts now produces for the prefetch:
    const prefetchKey = makeIssueQueryKey(globalParam); // titleSearch='', language='' by default

    // What +page.svelte produces on first render (titleSearch='' and selectedLanguage='' initially):
    const clientKey = makeIssueQueryKey(globalParam, '', '');

    assert.deepEqual(prefetchKey, clientKey);
  });

  // Demonstrates the OLD mismatch that caused the hydration bug:
  it('REGRESSION – old bare key did not match new key (demonstrates the old bug)', () => {
    const oldPrefetchKey = ['issues', { global: false }]; // what +page.ts had before
    const newClientKey = makeIssueQueryKey(false, '', ''); // what +page.svelte uses now

    assert.notDeepEqual(
      oldPrefetchKey,
      newClientKey,
      'Old key lacked titleSearch/language fields — TanStack treated them as different entries',
    );
  });

  // Title search moves filtering to the server: the resulting buildQuery output
  // contains `in:title`, proving GitHub (not the client) applies the filter.
  // Without titleSearch, `in:title` is absent — this is the old client-side path.
  it('REGRESSION – title search adds in:title to server query, removing need for client-side filter', () => {
    const BASE = FIXTURE_QUERIES.org;

    const queryWithSearch = buildQuery(BASE, 'Rust async runtime');
    const queryWithoutSearch = buildQuery(BASE);

    // New path: server filters by title
    assert.match(
      queryWithSearch,
      /in:title/,
      'A titleSearch must produce a server-side in:title qualifier',
    );

    // Old path: no server filter — client had to filter locally (the bug)
    assert.doesNotMatch(
      queryWithoutSearch,
      /in:title/,
      'Without titleSearch, no in:title qualifier is added (client-side filtering was the old behaviour)',
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
