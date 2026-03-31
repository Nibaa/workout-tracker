<script lang="ts">
	import { onMount } from 'svelte';
	import { getExercises, createExercise, updateExercise, deleteExercise, getMuscleGroups, addMuscleGroup, getSettings, getIncrementProfiles } from '$lib/store';
	import type { Exercise, MuscleGroup, Settings, IncrementProfile } from '$lib/types';

	let exercises = $state<Exercise[]>([]);
	let muscleGroups = $state<MuscleGroup[]>([]);
	let settings = $state<Settings>(getSettings());
	let profiles = $state<IncrementProfile[]>([]);
	let loading = $state(true);
	let filterGroup = $state('');
	let searchQuery = $state('');

	// Create form
	let showCreate = $state(false);
	let newName = $state('');
	let newGroupId = $state('');
	let newIsBodyweight = $state(false);
	let newNotes = $state('');
	let newRepTarget = $state<number | undefined>();
	let newWeightIncrements = $state('');
	let newProfileId = $state('');

	// Edit state
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editGroupId = $state('');
	let editIsBodyweight = $state(false);
	let editNotes = $state('');
	let editRepTarget = $state<number | undefined>();
	let editWeightIncrements = $state('');
	let editProfileId = $state('');

	// New group
	let showNewGroup = $state(false);
	let newGroupName = $state('');

	onMount(async () => {
		settings = getSettings();
		muscleGroups = await getMuscleGroups();
		profiles = await getIncrementProfiles();
		await loadExercises();
	});

	async function loadExercises() {
		loading = true;
		exercises = await getExercises();
		loading = false;
	}

	const filteredExercises = $derived(
		exercises.filter(e => {
			const matchesGroup = !filterGroup || e.muscleGroupId === filterGroup;
			const matchesSearch = !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase());
			return matchesGroup && matchesSearch;
		})
	);

	const groupedExercises = $derived(() => {
		const groups = new Map<string, { group: MuscleGroup; exercises: Exercise[] }>();
		for (const ex of filteredExercises) {
			const group = muscleGroups.find(g => g.id === ex.muscleGroupId);
			if (!group) continue;
			if (!groups.has(group.id)) groups.set(group.id, { group, exercises: [] });
			groups.get(group.id)!.exercises.push(ex);
		}
		return [...groups.values()].sort((a, b) => a.group.name.localeCompare(b.group.name));
	});

	async function handleCreate() {
		if (!newName.trim() || !newGroupId) return;
		const increments = newWeightIncrements
			? newWeightIncrements.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
			: undefined;

		await createExercise({
			name: newName.trim(),
			muscleGroupId: newGroupId,
			isBodyweight: newIsBodyweight,
			notes: newNotes.trim() || undefined,
			repTarget: newRepTarget,
			weightIncrements: increments?.length ? increments : undefined,
			incrementProfileId: newProfileId || undefined
		});

		newName = '';
		newGroupId = '';
		newIsBodyweight = false;
		newNotes = '';
		newRepTarget = undefined;
		newWeightIncrements = '';
		newProfileId = '';
		showCreate = false;
		await loadExercises();
	}

	function startEdit(ex: Exercise) {
		editingId = ex.id;
		editName = ex.name;
		editGroupId = ex.muscleGroupId;
		editIsBodyweight = ex.isBodyweight;
		editNotes = ex.notes ?? '';
		editRepTarget = ex.repTarget;
		editWeightIncrements = ex.weightIncrements?.join(', ') ?? '';
		editProfileId = ex.incrementProfileId ?? '';
	}

	async function saveEdit() {
		if (!editingId || !editName.trim() || !editGroupId) return;
		const increments = editWeightIncrements
			? editWeightIncrements.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
			: undefined;

		await updateExercise(editingId, {
			name: editName.trim(),
			muscleGroupId: editGroupId,
			isBodyweight: editIsBodyweight,
			notes: editNotes.trim() || undefined,
			repTarget: editRepTarget,
			weightIncrements: increments?.length ? increments : undefined,
			incrementProfileId: editProfileId || undefined
		});

		editingId = null;
		await loadExercises();
	}

	async function handleDelete(id: string) {
		await deleteExercise(id);
		await loadExercises();
	}

	async function handleAddGroup() {
		if (!newGroupName.trim()) return;
		await addMuscleGroup(newGroupName.trim());
		muscleGroups = await getMuscleGroups();
		newGroupName = '';
		showNewGroup = false;
	}

	function getGroupName(id: string): string {
		return muscleGroups.find(g => g.id === id)?.name ?? 'Unknown';
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-6">
	<div class="flex items-center justify-between mb-4">
		<h1 class="text-2xl font-bold">Exercises</h1>
		<button
			onclick={() => showCreate = !showCreate}
			class="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
		>
			{showCreate ? 'Cancel' : '+ New'}
		</button>
	</div>

	<!-- Search & Filter -->
	<div class="flex gap-2 mb-4">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Search exercises..."
			class="flex-1 bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none text-sm"
		/>
		<select
			bind:value={filterGroup}
			class="bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm"
		>
			<option value="">All groups</option>
			{#each muscleGroups as group}
				<option value={group.id}>{group.name}</option>
			{/each}
		</select>
	</div>

	<!-- Create Form -->
	{#if showCreate}
		<div class="bg-dark-card rounded-xl p-4 mb-4 border border-accent space-y-3">
			<input
				type="text"
				bind:value={newName}
				placeholder="Exercise name"
				class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
			/>

			<div class="flex gap-2 items-end">
				<div class="flex-1">
					<select
						bind:value={newGroupId}
						class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border"
					>
						<option value="">Muscle group...</option>
						{#each muscleGroups as group}
							<option value={group.id}>{group.name}</option>
						{/each}
					</select>
				</div>
				{#if showNewGroup}
					<input
						type="text"
						bind:value={newGroupName}
						placeholder="New group"
						class="flex-1 bg-dark-surface px-3 py-2 rounded-lg border border-dark-border text-sm"
					/>
					<button onclick={handleAddGroup} class="text-success text-sm">Add</button>
				{:else}
					<button onclick={() => showNewGroup = true} class="text-accent text-xs whitespace-nowrap">+ Group</button>
				{/if}
			</div>

			<label class="flex items-center gap-2 text-sm text-text-secondary">
				<input type="checkbox" bind:checked={newIsBodyweight} class="accent-accent" />
				Bodyweight exercise
			</label>

			<input
				type="text"
				bind:value={newNotes}
				placeholder="Form notes (optional)"
				class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm"
			/>

			<div class="flex gap-2">
				<div class="flex-1">
					<label class="text-xs text-text-muted">Rep target (override)</label>
					<input type="number" bind:value={newRepTarget} placeholder="{settings.defaultRepTarget}"
						class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
				</div>
				<div class="flex-1">
					<label class="text-xs text-text-muted">Weight increments</label>
					<input type="text" bind:value={newWeightIncrements} placeholder="e.g. 1, 1.5, 2"
						class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
				</div>
			</div>

			<div>
				<label class="text-xs text-text-muted">Weight profile</label>
				<select
					bind:value={newProfileId}
					class="w-full bg-dark-surface text-text-primary px-3 py-1.5 rounded border border-dark-border text-sm"
				>
					<option value="">None (use increments)</option>
					{#each profiles as p}
						<option value={p.id}>{p.name} ({p.weights[0]}–{p.weights[p.weights.length - 1]} kg)</option>
					{/each}
				</select>
				<p class="text-xs text-text-muted mt-0.5">Profile overrides custom increments. Manage in Settings.</p>
			</div>

			<button
				onclick={handleCreate}
				disabled={!newName.trim() || !newGroupId}
				class="w-full bg-success hover:bg-green-600 disabled:bg-dark-surface disabled:text-text-muted text-white py-2 rounded-lg font-medium transition-colors"
			>
				Create Exercise
			</button>
		</div>
	{/if}

	<!-- Exercise List -->
	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if filteredExercises.length === 0}
		<div class="text-center py-12">
			<p class="text-text-secondary">No exercises found.</p>
		</div>
	{:else}
		{#each groupedExercises() as { group, exercises: groupExercises }}
			<div class="mb-4">
				<h2 class="text-sm font-semibold text-text-muted mb-2 uppercase tracking-wide">{group.name}</h2>
				<div class="space-y-2">
					{#each groupExercises as ex}
						{#if editingId === ex.id}
							<div class="bg-dark-card rounded-xl p-3 border border-accent space-y-2">
								<input type="text" bind:value={editName}
									class="w-full bg-dark-surface px-3 py-1.5 rounded border border-dark-border text-sm" />
								<select bind:value={editGroupId}
									class="w-full bg-dark-surface px-3 py-1.5 rounded border border-dark-border text-sm">
									{#each muscleGroups as g}
										<option value={g.id}>{g.name}</option>
									{/each}
								</select>
								<label class="flex items-center gap-2 text-xs text-text-secondary">
									<input type="checkbox" bind:checked={editIsBodyweight} class="accent-accent" />
									Bodyweight
								</label>
								<input type="text" bind:value={editNotes} placeholder="Notes"
									class="w-full bg-dark-surface px-3 py-1.5 rounded border border-dark-border text-sm" />
								<div class="flex gap-2">
									<input type="number" bind:value={editRepTarget} placeholder="Rep target"
										class="flex-1 bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
									<input type="text" bind:value={editWeightIncrements} placeholder="Increments"
										class="flex-1 bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
								</div>
								<select
									bind:value={editProfileId}
									class="w-full bg-dark-surface text-text-primary px-3 py-1.5 rounded border border-dark-border text-sm"
								>
									<option value="">No weight profile</option>
									{#each profiles as p}
										<option value={p.id}>{p.name} ({p.weights[0]}–{p.weights[p.weights.length - 1]} kg)</option>
									{/each}
								</select>
								<div class="flex gap-2">
									<button onclick={saveEdit} class="flex-1 bg-success text-white py-1.5 rounded text-sm">Save</button>
									<button onclick={() => editingId = null} class="flex-1 bg-dark-surface text-text-secondary py-1.5 rounded text-sm">Cancel</button>
								</div>
							</div>
						{:else}
							<div class="flex items-center gap-2 bg-dark-card rounded-lg p-3">
								<div class="flex-1">
									<span class="text-sm font-medium">{ex.name}</span>
									{#if ex.isBodyweight}
										<span class="text-xs text-text-muted ml-1">BW</span>
									{/if}
									{#if ex.incrementProfileId}
										{@const prof = profiles.find(p => p.id === ex.incrementProfileId)}
										{#if prof}
											<span class="text-xs text-accent ml-1">· {prof.name}</span>
										{/if}
									{/if}
									{#if ex.notes}
										<p class="text-xs text-text-muted mt-0.5">{ex.notes}</p>
									{/if}
								</div>
								<button onclick={() => startEdit(ex)} class="text-accent text-xs">Edit</button>
								<button onclick={() => handleDelete(ex.id)} class="text-danger text-xs">×</button>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
