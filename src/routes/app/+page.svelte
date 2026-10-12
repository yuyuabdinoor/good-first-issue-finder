<script lang="ts">
  import LoadMore from '$lib/components/load-more.svelte';
  import Toggle from '$lib/components/toggle.svelte';
  import Seo from '$lib/components/seo.svelte';

  import { goto, disableScrollHandling, afterNavigate } from '$app/navigation';
  import type { PageData } from './$types';
  import { type QueryMode, ALLOWED_LANGUAGES, makeIssueQueryKey } from '$lib/query-builder';
  import Loader from '$lib/components/loader.svelte';
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import { fetchIssues } from '$lib/data';
  import IssueCard from '$lib/components/issue-card.svelte';
  import Filter from '$lib/components/filter.svelte';
  import Search from '$lib/components/search.svelte';
  import Modal from '$lib/components/modal.svelte';
  export let data: PageData;

  let { checked } = data;
  if (!checked) checked = false;

  // titleSearch drives server-side GitHub `in:title` filtering.
  // Changing it creates a new queryKey → TanStack Query discards the old
  // paginated cache and starts fresh from page 1.
  let titleSearch = '';

  // language is validated server-side against the allowlist.
  // '' means no language filter.
  let selectedLanguage = '';

  // Labels are still filtered client-side against whichever pages are loaded.
  // They narrow results within the current page set; they do not re-query GitHub.
  let selectedLabels: string[] = [];

  $: mode = (checked ? 'global' : 'org') as QueryMode;

  $: issues = createInfiniteQuery({
    // makeIssueQueryKey produces the same key shape used in +page.ts prefetch.
    // Including titleSearch and selectedLanguage means any change creates a new
    // cache entry → TanStack Query discards old pages and starts from page 1.
    queryKey: makeIssueQueryKey(checked, titleSearch, selectedLanguage),
    queryFn: ({ pageParam }) =>
      fetchIssues(mode, pageParam, titleSearch || undefined, selectedLanguage || undefined),
    getNextPageParam: (lastPage) => {
      if (lastPage.pageInfo.hasNextPage) return lastPage.pageInfo.endCursor;
      return undefined;
    },
  });

  afterNavigate(() => {
    disableScrollHandling();
  });

  const onChangeHandler = async () => {
    if (checked) {
      await goto('?global=true', { noScroll: true });
      return;
    }
    await goto('?global=false', { noScroll: true });
  };

  const onFilterClear = () => {
    selectedLabels = [];
  };

  // Label filtering remains client-side: it narrows the already-loaded pages.
  // Title search is handled server-side, so no client-side title filter here.
  $: filteredResponse = $issues.data?.pages?.flatMap((page) =>
    page.edges.filter((edge) => {
      if (selectedLabels.length === 0) return true;
      const labels = edge.node.labels.edges.map((node) => node.node.name);
      return selectedLabels.every((label) => labels.includes(label));
    }),
  );

  // SEO Parameters
  const title = 'Dashboard | Good First Issue Finder';
  const metadescription =
    'Find good first issues by either querying the EddieHub organization or the community';
</script>

<Seo {title} {metadescription} />

<div class="flex flex-col items-center justify-center">
  <div class="mb-4">
    <div class="justify-self-center">
      <Toggle
        id="toggle"
        bind:checked
        labelLeft="EddieHub"
        labelRight="GitHub"
        on:change={onChangeHandler}
      />
    </div>
  </div>
  <div class="flex flex-wrap items-center justify-center gap-2">
    <Search bind:searchTerm={titleSearch} />

    <!-- Language filter: validated server-side against an allowlist -->
    <select
      bind:value={selectedLanguage}
      class="rounded-xl bg-skin-off-background px-4 py-2 leading-4 shadow-standard dark:shadow-dark"
      aria-label="Filter by language"
    >
      <option value="">All languages</option>
      {#each ALLOWED_LANGUAGES as lang}
        <option value={lang}>{lang}</option>
      {/each}
    </select>

    <div class="flex items-center justify-center">
      <Modal clearFilter={onFilterClear} title="Filters" amount={selectedLabels}>
        <!--
          Labels shown here come only from pages already loaded.
          Use Load More to fetch additional pages before filtering by label.
        -->
        <p class="mb-2 text-sm text-gray-500">
          Labels shown are from loaded pages only. Load more results to see additional labels.
        </p>
        <Filter
          bind:group={selectedLabels}
          tags={$issues.data?.pages?.flatMap((page) => page.labels) || []}
        />
      </Modal>
    </div>
  </div>
</div>

{#if $issues.isInitialLoading}
  <div class="mt-8 flex items-center justify-center gap-4">
    <Loader background="off-background" /> Loading...
  </div>
{:else if filteredResponse}
  {#if filteredResponse.length < 1}
    {#if selectedLabels.length > 0 && $issues.hasNextPage}
      <div class="mt-4 text-center">
        No matches in loaded results.
        <button class="underline" on:click={() => $issues.fetchNextPage()}>Load more</button> to search
        further pages for the selected label.
      </div>
    {:else if !checked && !titleSearch && !selectedLanguage && selectedLabels.length === 0}
      <div class="mt-4 text-center">
        No open, unassigned EddieHub issues match right now.
        <a class="underline" href="/app?global=true">Browse GitHub issues</a> instead.
      </div>
    {:else}
      <div class="mt-4 text-center">Unfortunately, there were no issues found.</div>
    {/if}
  {:else}
    <div class="mb-4 mt-6 space-y-4">
      {#each filteredResponse as edge}
        <IssueCard issue={edge.node} />
      {/each}
    </div>
    {#if $issues.hasNextPage}
      <div class="flex items-center justify-center">
        <LoadMore isDisabled={$issues.isFetchingNextPage} on:load={() => $issues.fetchNextPage()} />
      </div>
    {/if}
  {/if}
{/if}
