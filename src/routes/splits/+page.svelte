<script lang="ts">
	import { onMount } from 'svelte';
	import { getSplits, createSplit, deleteSplit, getSplitDays } from '$lib/store';
	import type { Split, SplitDay } from '$lib/types';

	let splits = $state<Array<Split & { days?: SplitDay[] }>>([]);
	let showCreate = $state(false);
	let newName = $state('');
	let newType = $state<'weekday' | 'sequential'>('sequential');
	let loading = $state(true);

	onMount(async () => {
		await loadSplits();
	});

	async function loadSplits() {
		loading = true;
		const raw = await getSplits();
		splits = await Promise.all(raw.map(async (s) => {
			const days = await getSplitDays(s.id);
			return { ...s, days };
		}));
		loading = false;
	}

	async function handleCreate() {
		if (!newName.trim()) return;
		await createSplit(newName.trim(), newType);
		newName = '';
		showCreate = false;
		await loadSplits();
	}

	async function handleDelete(id: string) {
		await deleteSplit(id);
		await loadSplits();
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-6">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">Splits</h1>
		<button
			onclick={() => showCreate = !showCreate}
			class="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
		>
			{showCreate ? 'Cancel' : '+ New'}
		</button>
	</div>

	{#if showCreate}
		<div class="bg-dark-card rounded-xl p-4 mb-4 border border-dark-border">
			<input
				type="text"
				bind:value={newName}
				placeholder="Split name (e.g., Push/Pull/Legs)"
				class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none mb-3"
			/>
			<div class="flex gap-2 mb-3">
				<button
					onclick={() => newType = 'sequential'}
					class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors
						{newType === 'sequential' ? 'bg-accent text-white' : 'bg-dark-surface text-text-secondary'}"
				>
					Sequential
				</button>
				<button
					onclick={() => newType = 'weekday'}
					class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors
						{newType === 'weekday' ? 'bg-accent text-white' : 'bg-dark-surface text-text-secondary'}"
				>
					Weekday-based
				</button>
			</div>
			<p class="text-text-muted text-xs mb-3">
				{newType === 'sequential'
					? 'Days cycle in order regardless of weekday (Day 1 → Day 2 → Day 3 → ...).'
					: 'Each day is tied to a specific weekday (e.g., Monday = Chest).'}
			</p>
			<button
				onclick={handleCreate}
				disabled={!newName.trim()}
				class="w-full bg-success hover:bg-green-600 disabled:bg-dark-surface disabled:text-text-muted text-white py-2 rounded-lg font-medium transition-colors"
			>
				Create Split
			</button>
		</div>
	{/if}

	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if splits.length === 0}
		<div class="text-center py-12">
			<p class="text-text-secondary">No splits yet. Create one to get started!</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each splits as split}
				<a href="/splits/{split.id}" class="block bg-dark-card rounded-xl p-4 border border-dark-border hover:border-accent/50 transition-colors">
					<div class="flex items-center justify-between mb-1">
						<h2 class="font-semibold">{split.name}</h2>
						<span class="text-xs text-text-muted capitalize">{split.type}</span>
					</div>
					<p class="text-text-secondary text-sm">
						{split.days?.length ?? 0} day{(split.days?.length ?? 0) !== 1 ? 's' : ''}
					</p>
					{#if split.days && split.days.length > 0}
						<div class="flex flex-wrap gap-1 mt-2">
							{#each split.days as day}
								<span class="text-xs bg-dark-surface px-2 py-0.5 rounded-full text-text-secondary">
									{day.name}
								</span>
							{/each}
						</div>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>
