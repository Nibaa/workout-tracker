<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		getSplit, updateSplit, deleteSplit, getSplitDays, createSplitDay, updateSplitDay,
		deleteSplitDay, getExerciseSlots, createExerciseSlot, updateExerciseSlot,
		deleteExerciseSlot, getExercises, getMuscleGroups, getAllExerciseIdsForSlot
	} from '$lib/store';
	import type {
		Split, SplitDay, ExerciseSlot, Exercise, MuscleGroup, ExerciseSlotType
	} from '$lib/types';
	import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from '$lib/types';

	const splitId = $derived($page.params.id);

	let split = $state<Split | undefined>();
	let days = $state<Array<SplitDay & { slots: Array<ExerciseSlot & { exercise?: Exercise; alternateExercises?: Exercise[] }> }>>([]);
	let allExercises = $state<Exercise[]>([]);
	let muscleGroups = $state<MuscleGroup[]>([]);
	let loading = $state(true);

	// New day form
	let showAddDay = $state(false);
	let newDayName = $state('');
	let newDayWeekday = $state<Weekday>('monday');
	let newDayRepTarget = $state<number | undefined>();

	// New slot form
	let addingSlotForDay = $state<string | null>(null);
	let newSlotExerciseId = $state('');
	let newSlotAlternateIds = $state<string[]>([]);
	let newSlotType = $state<ExerciseSlotType>('core');
	let newSlotSets = $state(3);
	let newSlotReps = $state<number | undefined>();
	let newSlotRest = $state<number | undefined>();

	// Edit name
	let editingName = $state(false);
	let editName = $state('');

	onMount(async () => {
		allExercises = await getExercises();
		muscleGroups = await getMuscleGroups();
		await loadData();
	});

	async function loadData() {
		loading = true;
		split = await getSplit(splitId);
		if (!split) { goto('/splits'); return; }
		editName = split.name;

		const rawDays = await getSplitDays(splitId);
		days = await Promise.all(rawDays.map(async (day) => {
			const rawSlots = await getExerciseSlots(day.id);
			const slots = await Promise.all(rawSlots.map(async (slot) => {
				const exercise = allExercises.find(e => e.id === slot.exerciseId);
				const altIds = getAllExerciseIdsForSlot(slot).slice(1);
				const alternateExercises = altIds.map(id => allExercises.find(e => e.id === id)).filter((e): e is Exercise => !!e);
				return { ...slot, exercise, alternateExercises };
			}));
			return { ...day, slots };
		}));
		loading = false;
	}

	async function saveName() {
		if (!editName.trim() || !split) return;
		await updateSplit(split.id, { name: editName.trim() });
		split = { ...split, name: editName.trim() };
		editingName = false;
	}

	async function handleDeleteSplit() {
		if (!split) return;
		await deleteSplit(split.id);
		goto('/splits');
	}

	async function handleAddDay() {
		if (!newDayName.trim()) return;
		const order = days.length;
		await createSplitDay(splitId, newDayName.trim(), order, split?.type === 'weekday' ? newDayWeekday : undefined, newDayRepTarget);
		newDayName = '';
		newDayRepTarget = undefined;
		showAddDay = false;
		await loadData();
	}

	async function handleDeleteDay(dayId: string) {
		await deleteSplitDay(dayId);
		await loadData();
	}

	async function handleAddSlot(dayId: string) {
		if (!newSlotExerciseId) return;
		const day = days.find(d => d.id === dayId);
		if (!day) return;

		const altIds = newSlotType === 'alternating' ? newSlotAlternateIds.filter(id => id && id !== newSlotExerciseId) : undefined;
		await createExerciseSlot({
			splitDayId: dayId,
			order: day.slots.length,
			type: newSlotType,
			exerciseId: newSlotExerciseId,
			alternateExerciseIds: altIds?.length ? altIds : undefined,
			targetSets: newSlotSets,
			targetReps: newSlotReps,
			restSeconds: newSlotRest
		});

		addingSlotForDay = null;
		newSlotExerciseId = '';
		newSlotAlternateIds = [];
		newSlotType = 'core';
		newSlotSets = 3;
		newSlotReps = undefined;
		newSlotRest = undefined;
		await loadData();
	}

	async function handleDeleteSlot(slotId: string) {
		await deleteExerciseSlot(slotId);
		await loadData();
	}

	function getExercisesByGroup(groupId: string): Exercise[] {
		return allExercises.filter(e => e.muscleGroupId === groupId);
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-6">
	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if split}
		<!-- Header -->
		<div class="flex items-center gap-3 mb-6">
			<a href="/splits" class="text-text-secondary hover:text-text-primary text-xl">←</a>
			{#if editingName}
				<input
					type="text"
					bind:value={editName}
					onkeydown={(e) => { if (e.key === 'Enter') saveName(); }}
					class="flex-1 bg-dark-surface text-xl font-bold px-2 py-1 rounded border border-accent focus:outline-none"
				/>
				<button onclick={saveName} class="text-success text-sm">Save</button>
			{:else}
				<h1 class="flex-1 text-2xl font-bold" ondblclick={() => editingName = true}>{split.name}</h1>
				<button onclick={() => editingName = true} class="text-text-muted text-sm">Edit</button>
			{/if}
		</div>

		<p class="text-text-muted text-sm mb-4 capitalize">{split.type} split</p>

		<!-- Days -->
		{#each days as day, dayIndex}
			<div class="bg-dark-card rounded-xl p-4 mb-3 border border-dark-border">
				<div class="flex items-center justify-between mb-3">
					<div>
						<h3 class="font-semibold">{day.name}</h3>
						{#if day.weekday}
							<span class="text-text-muted text-xs">{WEEKDAY_LABELS[day.weekday]}</span>
						{:else}
							<span class="text-text-muted text-xs">Day {day.order + 1}</span>
						{/if}
						{#if day.defaultRepTarget}
							<span class="text-text-muted text-xs ml-1">· {day.defaultRepTarget} rep target</span>
						{/if}
					</div>
					<div class="flex gap-2 items-center">
						<button onclick={async () => {
							const val = prompt('Default rep target for this day (empty = use global):', String(day.defaultRepTarget ?? ''));
							if (val !== null) {
								const num = val.trim() ? parseInt(val) : undefined;
								await updateSplitDay(day.id, { defaultRepTarget: num });
								await loadData();
							}
						}} class="text-accent text-xs">Rep target</button>
						<button onclick={() => handleDeleteDay(day.id)} class="text-danger text-xs">Delete</button>
					</div>
				</div>

				<!-- Slots -->
				{#if day.slots.length > 0}
					<div class="space-y-2 mb-3">
						{#each day.slots as slot, slotIndex}
							<div class="flex items-center gap-2 p-2 bg-dark-surface rounded-lg text-sm">
								<span class="text-text-muted w-5 text-xs">{slotIndex + 1}.</span>
								<div class="flex-1">
									<span>{slot.exercise?.name ?? 'Unknown'}</span>
									{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
										<span class="text-warning"> ↔ {slot.alternateExercises.map(e => e.name).join(' ↔ ')}</span>
									{/if}
									<div class="text-text-muted text-xs">
										{slot.targetSets} sets
										{#if slot.targetReps} · {slot.targetReps} reps{/if}
										{#if slot.type !== 'core'} · <span class="capitalize">{slot.type}</span>{/if}
										{#if slot.restSeconds} · {slot.restSeconds}s rest{/if}
									</div>
								</div>
								<button onclick={() => handleDeleteSlot(slot.id)} class="text-danger text-xs">×</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Add Slot -->
				{#if addingSlotForDay === day.id}
					<div class="border border-dark-border rounded-lg p-3 space-y-3">
						<select
							bind:value={newSlotExerciseId}
							class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border"
						>
							<option value="">Select exercise...</option>
							{#each muscleGroups as group}
								{@const exercises = getExercisesByGroup(group.id)}
								{#if exercises.length > 0}
									<optgroup label={group.name}>
										{#each exercises as ex}
											<option value={ex.id}>{ex.name}</option>
										{/each}
									</optgroup>
								{/if}
							{/each}
						</select>

						<div class="flex gap-2">
							{#each ['core', 'alternating', 'optional'] as type}
								<button
									onclick={() => {
										newSlotType = type as ExerciseSlotType;
										if (type === 'alternating' && newSlotAlternateIds.length === 0) {
											newSlotAlternateIds = [''];
										}
									}}
									class="flex-1 py-1.5 rounded text-xs font-medium transition-colors capitalize
										{newSlotType === type ? 'bg-accent text-white' : 'bg-dark-surface text-text-secondary'}"
								>
									{type}
								</button>
							{/each}
						</div>

						{#if newSlotType === 'alternating'}
							<div class="space-y-2">
								{#each newSlotAlternateIds as _, i}
									<div class="flex gap-2 items-center">
										<select
											bind:value={newSlotAlternateIds[i]}
											class="flex-1 bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border"
										>
											<option value="">Alternate exercise {i + 1}...</option>
											{#each allExercises as ex}
												{#if ex.id !== newSlotExerciseId && !newSlotAlternateIds.some((id, j) => j !== i && id === ex.id)}
													<option value={ex.id}>{ex.name}</option>
												{/if}
											{/each}
										</select>
										<button
											onclick={() => newSlotAlternateIds = newSlotAlternateIds.filter((_, j) => j !== i)}
											class="text-danger text-sm px-2"
										>×</button>
									</div>
								{/each}
								<button
									onclick={() => newSlotAlternateIds = [...newSlotAlternateIds, '']}
									class="text-accent text-xs"
								>
									+ Add another alternate
								</button>
							</div>
						{/if}

						<div class="flex gap-2">
							<div class="flex-1">
								<label class="text-xs text-text-muted">Sets</label>
								<input type="number" bind:value={newSlotSets} min="1" max="20"
									class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
							</div>
							<div class="flex-1">
								<label class="text-xs text-text-muted">Reps (optional)</label>
								<input type="number" bind:value={newSlotReps} min="1" max="100" placeholder="default"
									class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
							</div>
							<div class="flex-1">
								<label class="text-xs text-text-muted">Rest (s)</label>
								<input type="number" bind:value={newSlotRest} min="0" placeholder="default"
									class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
							</div>
						</div>

						<div class="flex gap-2">
							<button
								onclick={() => handleAddSlot(day.id)}
								disabled={!newSlotExerciseId}
								class="flex-1 bg-success hover:bg-green-600 disabled:bg-dark-surface text-white py-2 rounded-lg text-sm font-medium transition-colors"
							>
								Add
							</button>
							<button
								onclick={() => addingSlotForDay = null}
								class="px-4 bg-dark-surface text-text-secondary py-2 rounded-lg text-sm"
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<button
						onclick={() => addingSlotForDay = day.id}
						class="w-full text-accent text-sm py-2 rounded-lg border border-dashed border-dark-border hover:border-accent transition-colors"
					>
						+ Add Exercise
					</button>
				{/if}
			</div>
		{/each}

		<!-- Add Day -->
		{#if showAddDay}
			<div class="bg-dark-card rounded-xl p-4 mb-3 border border-accent">
				<input
					type="text"
					bind:value={newDayName}
					placeholder="Day name (e.g., Chest & Triceps)"
					class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none mb-3"
				/>
				{#if split.type === 'weekday'}
					<select
						bind:value={newDayWeekday}
						class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border mb-3"
					>
						{#each WEEKDAYS as wd}
							<option value={wd}>{WEEKDAY_LABELS[wd]}</option>
						{/each}
					</select>
				{/if}
				<div class="mb-3">
					<label class="text-xs text-text-muted">Default rep target (optional, overrides global)</label>
					<input type="number" bind:value={newDayRepTarget} min="1" max="100" placeholder="Use global default"
						class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border" />
				</div>
				<div class="flex gap-2">
					<button
						onclick={handleAddDay}
						disabled={!newDayName.trim()}
						class="flex-1 bg-success hover:bg-green-600 disabled:bg-dark-surface text-white py-2 rounded-lg font-medium transition-colors"
					>
						Add Day
					</button>
					<button
						onclick={() => showAddDay = false}
						class="px-4 bg-dark-surface text-text-secondary py-2 rounded-lg"
					>
						Cancel
					</button>
				</div>
			</div>
		{:else}
			<button
				onclick={() => showAddDay = true}
				class="w-full bg-dark-card text-accent py-3 rounded-xl border border-dashed border-dark-border hover:border-accent transition-colors mb-4"
			>
				+ Add Day
			</button>
		{/if}

		<!-- Delete Split -->
		<button
			onclick={handleDeleteSplit}
			class="w-full text-danger text-sm py-2 mt-4 opacity-50 hover:opacity-100 transition-opacity"
		>
			Delete this split
		</button>
	{/if}
</div>
