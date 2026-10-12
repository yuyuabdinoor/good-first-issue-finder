<script lang="ts">
  import LoadMore from '$lib/components/load-more.svelte';
  import Toggle from '$lib/components/toggle.svelte';
  import Seo from '$lib/components/seo.svelte';

  import { goto, disableScrollHandling, afterNavigate } from '$app/navigation';
  import type { PageData } from './$types';
  import {
    type QueryMode,
    ALLOWED_LANGUAGES,
    MAX_LABEL_FILTERS,
    makeIssueQueryKey,
    validateLabel,
  } from '$lib/query-builder';
  import Loader from '$lib/components/loader.svelte';
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import { fetchIssues } from '$lib/data';
  import IssueCard from '$lib/components/issue-card.svelte';
  import Filter from '$lib/components/filter.svelte';
  import Search from '$lib/components/search.svelte';
  import Modal from '$lib/components/modal.svelte';
  export let data: PageData;

  let checked = data.checked ?? false;
  $: checked = data.checked ?? false;

  // titleSearch drives server-side GitHub `in:title` filtering.
  // Changing it creates a new queryKey → TanStack Query discards the old
  // paginated cache and starts fresh from page 1.
  let titleSearch = '';

  // language is validated server-side against the allowlist.
  // '' means no language filter.
  let selectedLanguage = '';

  let selectedLabels: string[] = [];
  let labelInput = '';
  let labelError = '';

  $: mode = (checked ? 'global' : 'org') as QueryMode;

  $: issues = createInfiniteQuery({
    // makeIssueQueryKey produces the same key shape used in +page.ts prefetch.
    // Search and filter changes create a new cache entry and start at page 1.
    queryKey: makeIssueQueryKey(checked, titleSearch, selectedLanguage, selectedLabels),
    queryFn: ({ pageParam }) =>
      fetchIssues(
        mode,
        pageParam,
        titleSearch || undefined,
        selectedLanguage || undefined,
        selectedLabels,
      ),
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
    labelError = '';
  };

  const addLabel = () => {
    const label = validateLabel(labelInput);
    if (!label) {
      labelError = 'Enter a label of up to 100 characters without quotes or line breaks.';
      return;
    }
    if (selectedLabels.length >= MAX_LABEL_FILTERS) {
      labelError = `Select up to ${MAX_LABEL_FILTERS} labels.`;
      return;
    }
    if (!selectedLabels.includes(label)) selectedLabels = [...selectedLabels, label];
    labelInput = '';
    labelError = '';
  };

  $: filteredResponse = $issues.data?.pages?.flatMap((page) => page.edges);

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
        <p class="mb-2 text-sm text-gray-500">
          Choose a suggested label or enter any GitHub label. Results search all eligible issues.
        </p>
        <form class="flex gap-2" on:submit|preventDefault={addLabel}>
          <input
            bind:value={labelInput}
            aria-label="GitHub label name"
            placeholder="Enter a label name"
            class="min-w-0 flex-1 rounded border px-2 py-1"
          />
          <button type="submit" class="rounded bg-primary-100 px-3 py-1 text-white"
            >Add label</button
          >
        </form>
        {#if labelError}<p class="mt-1 text-sm text-red-600">{labelError}</p>{/if}
        <Filter
          bind:group={selectedLabels}
          tags={[...selectedLabels, ...($issues.data?.pages?.flatMap((page) => page.labels) || [])]}
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
    {#if !checked && !titleSearch && !selectedLanguage && selectedLabels.length === 0}
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
