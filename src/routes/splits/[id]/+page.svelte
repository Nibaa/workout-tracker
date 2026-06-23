<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		getSplit, updateSplit, deleteSplit, getSplitDays, createSplitDay, updateSplitDay,
		deleteSplitDay, getExerciseSlots, createExerciseSlot, updateExerciseSlot,
		deleteExerciseSlot, getExercises, getMuscleGroups, getAllExerciseIdsForSlot,
		getIncrementProfiles, getSettings, getExerciseInitialStateForSlot
	} from '$lib/store';
	import type {
		Split, SplitDay, ExerciseSlot, Exercise, MuscleGroup, ExerciseSlotType, IncrementProfile,
		Settings, ExerciseSlotExerciseState
	} from '$lib/types';
	import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from '$lib/types';

	const splitId = $derived($page.params.id ?? '');

	let split = $state<Split | undefined>();
	let days = $state<Array<SplitDay & { slots: Array<ExerciseSlot & { exercise?: Exercise; alternateExercises?: Exercise[] }> }>>([]);
	let allExercises = $state<Exercise[]>([]);
	let muscleGroups = $state<MuscleGroup[]>([]);
	let profiles = $state<IncrementProfile[]>([]);
	let settings = $state<Settings>(getSettings());
	let loading = $state(true);

	// Notes and deload
	let editingSplitNotes = $state(false);
	let splitNotesValue = $state('');
	let editingDayNoteId = $state<string | null>(null);
	let editingDayNoteValue = $state('');
	let deloadingSlotId = $state<string | null>(null);
	let deloadWeightValue = $state<number | undefined>();
	let deloadRepsValue = $state(6);

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
	let newSlotProfileId = $state('');
	let newSlotWeightIncrements = $state('');
	let newSlotRepTarget = $state<number | undefined>();
	let newSlotInitialWeight = $state<number | undefined>();
	let newSlotInitialReps = $state<number | undefined>();
	let newSlotUsePerSet = $state(false);
	let newSlotInitialSets = $state<Array<{ weight: number; reps: number }>>([]);

	// Edit slot
	let editingSlotId = $state<string | null>(null);
	let editSlotSets = $state(3);
	let editSlotReps = $state<number | undefined>();
	let editSlotRest = $state<number | undefined>();
	let editSlotProfileId = $state('');
	let editSlotWeightIncrements = $state('');
	let editSlotRepTarget = $state<number | undefined>();
	let editSlotInitialWeight = $state<number | undefined>();
	let editSlotInitialReps = $state<number | undefined>();
	let editSlotUsePerSet = $state(false);
	let editSlotInitialSets = $state<Array<{ weight: number; reps: number }>>([]);
	let editSlotExerciseStates = $state<Record<string, {
		initialWeight?: number;
		initialReps?: number;
		usePerSet: boolean;
		initialSets: Array<{ weight: number; reps: number }>;
	}>>({});

	// Edit name
	let editingName = $state(false);
	let editName = $state('');

	onMount(async () => {
		allExercises = await getExercises();
		muscleGroups = await getMuscleGroups();
		profiles = await getIncrementProfiles();
		settings = getSettings();
		await loadData();
	});

	async function loadData() {
		loading = true;
		if (!splitId) { goto('/splits'); return; }
		split = await getSplit(splitId);
		if (!split) { goto('/splits'); return; }
		editName = split.name;
		splitNotesValue = split.notes ?? '';

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
		if (!newDayName.trim() || !splitId) return;
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
		const increments = newSlotWeightIncrements
			? newSlotWeightIncrements.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
			: undefined;

		await createExerciseSlot({
			splitDayId: dayId,
			order: day.slots.length,
			type: newSlotType,
			exerciseId: newSlotExerciseId,
			alternateExerciseIds: altIds?.length ? altIds : undefined,
			targetSets: newSlotSets,
			targetReps: newSlotReps,
			restSeconds: newSlotRest,
			incrementProfileId: newSlotProfileId || undefined,
			weightIncrements: increments?.length ? increments : undefined,
			repTarget: newSlotRepTarget,
			initialWeight: newSlotInitialWeight,
			initialReps: newSlotInitialReps,
			initialSets: newSlotUsePerSet && newSlotInitialSets.length > 0 ? newSlotInitialSets : undefined
		});

		addingSlotForDay = null;
		newSlotExerciseId = '';
		newSlotAlternateIds = [];
		newSlotType = 'core';
		newSlotSets = 3;
		newSlotReps = undefined;
		newSlotRest = undefined;
		newSlotProfileId = '';
		newSlotWeightIncrements = '';
		newSlotRepTarget = undefined;
		newSlotInitialWeight = undefined;
		newSlotInitialReps = undefined;
		newSlotUsePerSet = false;
		newSlotInitialSets = [];
		await loadData();
	}

	async function handleDeleteSlot(slotId: string) {
		await deleteExerciseSlot(slotId);
		await loadData();
	}

	function startEditSlot(slot: ExerciseSlot) {
		editingSlotId = slot.id;
		editSlotSets = slot.targetSets;
		editSlotReps = slot.targetReps;
		editSlotRest = slot.restSeconds;
		editSlotProfileId = slot.incrementProfileId ?? '';
		editSlotWeightIncrements = slot.weightIncrements?.join(', ') ?? '';
		editSlotRepTarget = slot.repTarget;
		editSlotInitialWeight = slot.initialWeight;
		editSlotInitialReps = slot.initialReps;
		editSlotUsePerSet = !!slot.initialSets && slot.initialSets.length > 0;
		editSlotInitialSets = slot.initialSets ? [...slot.initialSets] : [];
		editSlotExerciseStates = Object.fromEntries(getAllExerciseIdsForSlot(slot).map((exerciseId) => {
			const initialState = getExerciseInitialStateForSlot(slot, exerciseId);
			return [exerciseId, createExerciseInitialStateDraft(initialState)];
		}));
	}

	async function saveEditSlot() {
		if (!editingSlotId) return;
		const slot = days.flatMap(day => day.slots).find(candidate => candidate.id === editingSlotId);
		if (!slot) return;
		const increments = editSlotWeightIncrements
			? editSlotWeightIncrements.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
			: undefined;
		const updates: Partial<Omit<ExerciseSlot, 'id'>> = {
			targetSets: editSlotSets,
			targetReps: editSlotReps,
			restSeconds: editSlotRest,
			incrementProfileId: editSlotProfileId || undefined,
			weightIncrements: increments?.length ? increments : undefined,
			repTarget: editSlotRepTarget
		};

		if (slot.type === 'alternating' && getAllExerciseIdsForSlot(slot).length > 1) {
			const primaryState = editSlotExerciseStates[slot.exerciseId] ?? createExerciseInitialStateDraft();
			updates.initialWeight = primaryState.initialWeight;
			updates.initialReps = primaryState.initialReps;
			updates.initialSets = primaryState.usePerSet && primaryState.initialSets.length > 0
				? primaryState.initialSets.map(set => ({ ...set }))
				: undefined;
			updates.exerciseInitialStatesById = serializeExerciseInitialStates(editSlotExerciseStates);
		} else {
			updates.initialWeight = editSlotInitialWeight;
			updates.initialReps = editSlotInitialReps;
			updates.initialSets = editSlotUsePerSet && editSlotInitialSets.length > 0
				? editSlotInitialSets
				: undefined;
		}

		await updateExerciseSlot(editingSlotId, updates);

		editingSlotId = null;
		await loadData();
	}

	function getExercisesByGroup(groupId: string): Exercise[] {
		return allExercises.filter(e => e.muscleGroupId === groupId);
	}

	function createExerciseInitialStateDraft(initialState?: ExerciseSlotExerciseState): {
		initialWeight?: number;
		initialReps?: number;
		usePerSet: boolean;
		initialSets: Array<{ weight: number; reps: number }>;
	} {
		return {
			initialWeight: initialState?.initialWeight,
			initialReps: initialState?.initialReps,
			usePerSet: !!initialState?.initialSets?.length,
			initialSets: initialState?.initialSets?.map(set => ({ ...set })) ?? []
		};
	}

	function serializeExerciseInitialStates(
		exerciseStates: typeof editSlotExerciseStates
	): Record<string, ExerciseSlotExerciseState> | undefined {
		const entries = Object.entries(exerciseStates)
			.map(([exerciseId, exerciseState]) => {
				const initialSets = exerciseState.usePerSet && exerciseState.initialSets.length > 0
					? exerciseState.initialSets.map(set => ({ ...set }))
					: undefined;
				const hasState = exerciseState.initialWeight !== undefined
					|| exerciseState.initialReps !== undefined
					|| !!initialSets;

				if (!hasState) return null;

				return [exerciseId, {
					initialWeight: exerciseState.initialWeight,
					initialReps: exerciseState.initialReps,
					initialSets
				}] as const;
			})
			.filter((entry): entry is readonly [string, ExerciseSlotExerciseState] => entry !== null);

		return entries.length > 0 ? Object.fromEntries(entries) : undefined;
	}

	function addEditExerciseInitialSet(exerciseId: string) {
		const exerciseState = editSlotExerciseStates[exerciseId];
		if (!exerciseState) return;
		exerciseState.initialSets = [
			...exerciseState.initialSets,
			{ weight: exerciseState.initialWeight ?? 0, reps: exerciseState.initialReps ?? 8 }
		];
	}

	function removeEditExerciseInitialSet(exerciseId: string, setIndex: number) {
		const exerciseState = editSlotExerciseStates[exerciseId];
		if (!exerciseState) return;
		exerciseState.initialSets = exerciseState.initialSets.filter((_, index) => index !== setIndex);
	}

	function getExerciseCurrentSummary(slot: ExerciseSlot, exerciseId: string): string | null {
		const initialState = getExerciseInitialStateForSlot(slot, exerciseId);
		if (initialState.initialSets && initialState.initialSets.length > 0) {
			return `Current sets: ${initialState.initialSets.map(set => `${set.weight}kg×${set.reps}`).join(', ')}`;
		}

		if (initialState.initialWeight !== undefined || initialState.initialReps !== undefined) {
			return `Current: ${initialState.initialWeight ?? 0}kg × ${initialState.initialReps ?? '?'} reps`;
		}

		return null;
	}

	async function saveSplitNotes() {
		if (!split) return;
		const trimmed = splitNotesValue.trim();
		await updateSplit(split.id, { notes: trimmed || undefined });
		split = { ...split, notes: trimmed || undefined };
		editingSplitNotes = false;
	}

	async function saveDayNote(dayId: string) {
		const trimmed = editingDayNoteValue.trim();
		await updateSplitDay(dayId, { reminderNote: trimmed || undefined });
		editingDayNoteId = null;
		await loadData();
	}

	function startDeload(slot: ExerciseSlot) {
		deloadingSlotId = slot.id;
		deloadWeightValue = slot.deloadWeight ?? slot.initialWeight ?? 0;
		deloadRepsValue = slot.deloadReps ?? 6;
	}

	async function handleDeload(slotId: string) {
		if (deloadWeightValue === undefined) return;
		await updateExerciseSlot(slotId, { deloadWeight: deloadWeightValue, deloadReps: deloadRepsValue });
		deloadingSlotId = null;
		await loadData();
	}

	async function clearDeload(slotId: string) {
		await updateExerciseSlot(slotId, { deloadWeight: undefined, deloadReps: undefined });
		await loadData();
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

		<p class="text-text-muted text-sm mb-2 capitalize">{split.type} split</p>

		{#if editingSplitNotes}
			<div class="bg-dark-card rounded-xl p-4 mb-4 space-y-2">
				<textarea bind:value={splitNotesValue} placeholder="General notes for this split..." rows="3"
					class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none resize-none text-sm"></textarea>
				<div class="flex gap-2">
					<button onclick={saveSplitNotes} class="flex-1 bg-accent hover:bg-accent-hover text-white py-1.5 rounded text-sm font-medium">Save</button>
					<button onclick={() => { editingSplitNotes = false; splitNotesValue = split?.notes ?? ''; }} class="px-4 bg-dark-surface text-text-secondary py-1.5 rounded text-sm">Cancel</button>
				</div>
			</div>
		{:else if split.notes}
			<div class="bg-dark-card rounded-xl p-4 mb-4 border border-dark-border">
				<div class="flex items-start justify-between gap-2">
					<p class="text-sm text-text-secondary flex-1">{split.notes}</p>
					<button onclick={() => { splitNotesValue = split?.notes ?? ''; editingSplitNotes = true; }} class="text-accent text-xs shrink-0">Edit</button>
				</div>
			</div>
		{:else}
			<button onclick={() => { splitNotesValue = ''; editingSplitNotes = true; }} class="text-accent text-sm mb-4 block hover:underline">+ Add notes</button>
		{/if}

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
							<span class="text-text-muted text-xs ml-1">· {day.defaultRepTarget} rep goal</span>
						{/if}
						{#if day.reminderNote}
							<p class="text-xs text-warning mt-1">📌 {day.reminderNote}</p>
						{/if}
					</div>
					<div class="flex gap-2 items-center">
						<button onclick={() => { editingDayNoteId = day.id; editingDayNoteValue = day.reminderNote ?? ''; }} class="text-accent text-xs">Note</button>
						<button onclick={async () => {
							const val = prompt('Default rep goal for this day (empty = use global):', String(day.defaultRepTarget ?? ''));
							if (val !== null) {
								const num = val.trim() ? parseInt(val) : undefined;
								await updateSplitDay(day.id, { defaultRepTarget: num });
								await loadData();
							}
						}} class="text-accent text-xs">Rep goal</button>
						<button onclick={() => handleDeleteDay(day.id)} class="text-danger text-xs">Delete</button>
					</div>
				</div>

				{#if editingDayNoteId === day.id}
					<div class="mb-3 space-y-2">
						<textarea bind:value={editingDayNoteValue}
							placeholder="Reminder shown at the start of the next session for this day..."
							rows="2"
							class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none resize-none text-sm"></textarea>
						<div class="flex gap-2">
							<button onclick={() => saveDayNote(day.id)} class="flex-1 bg-accent hover:bg-accent-hover text-white py-1.5 rounded text-sm font-medium">Save</button>
							<button onclick={() => editingDayNoteId = null} class="px-4 bg-dark-surface text-text-secondary py-1.5 rounded text-sm">Cancel</button>
						</div>
					</div>
				{/if}

				<!-- Slots -->
				{#if day.slots.length > 0}
					<div class="space-y-2 mb-3">
						{#each day.slots as slot, slotIndex}
							{#if editingSlotId === slot.id}
								<!-- Edit Slot Form -->
								<div class="p-3 bg-dark-surface rounded-lg border border-accent space-y-3">
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium">{slot.exercise?.name ?? 'Unknown'}</span>
										<span class="text-xs text-text-muted capitalize">{slot.type}</span>
									</div>

									<div class="flex gap-2">
										<div class="flex-1">
											<label class="text-xs text-text-muted">Sets</label>
											<input type="number" bind:value={editSlotSets} min="1" max="20"
												class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
										</div>
										<div class="flex-1">
											<label class="text-xs text-text-muted">Reps</label>
											<input type="number" bind:value={editSlotReps} min="1" max="100" placeholder="default"
												class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
										</div>
										<div class="flex-1">
											<label class="text-xs text-text-muted">Rest (s)</label>
											<input type="number" bind:value={editSlotRest} min="0" placeholder="default"
												class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
										</div>
									</div>

									{#if profiles.length > 0}
										<div>
											<label class="text-xs text-text-muted">Weight profile</label>
											<select
												bind:value={editSlotProfileId}
												class="w-full bg-dark-card text-text-primary px-3 py-1.5 rounded border border-dark-border text-sm"
											>
												<option value="">None (use increments)</option>
												{#each profiles as p}
													<option value={p.id}>{p.name} ({p.weights[0]}–{p.weights[p.weights.length - 1]} kg)</option>
												{/each}
											</select>
										</div>
									{/if}

									<div class="flex gap-2">
										<div class="flex-1">
											<label class="text-xs text-text-muted">Rep goal</label>
											<input type="number" bind:value={editSlotRepTarget} min="1" placeholder={String(settings.defaultRepTarget)}
												class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
										</div>
										<div class="flex-1">
											<label class="text-xs text-text-muted">Weight increments</label>
											<input type="text" bind:value={editSlotWeightIncrements} placeholder="e.g. 1, 1.5, 2"
												class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
										</div>
									</div>

									{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
										<div class="space-y-3">
											<p class="text-xs text-text-muted">Current values</p>
											{#if slot.exercise && editSlotExerciseStates[slot.exerciseId]}
												{@const primaryState = editSlotExerciseStates[slot.exerciseId]}
												<div class="rounded-lg border border-dark-border p-3 space-y-2">
													<p class="text-sm font-medium">{slot.exercise.name}</p>
													<div class="flex gap-2">
														<div class="flex-1">
															<label class="text-xs text-text-muted">Current weight (kg)</label>
															<input type="number" bind:value={primaryState.initialWeight} placeholder="0" step="0.5"
																class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
														</div>
														<div class="flex-1">
															<label class="text-xs text-text-muted">Current reps</label>
															<input type="number" bind:value={primaryState.initialReps} placeholder="8"
																class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
														</div>
													</div>
													<label class="flex items-center gap-2 text-xs text-text-secondary">
														<input type="checkbox" bind:checked={primaryState.usePerSet} class="accent-accent" />
														Per-set current values
													</label>
													{#if primaryState.usePerSet}
														<div class="space-y-2">
															{#each primaryState.initialSets as set, i}
																<div class="flex gap-2 items-center">
																	<span class="text-xs text-text-muted w-6">S{i + 1}</span>
																	<input type="number" bind:value={set.weight} placeholder="kg" step="0.5"
																		class="flex-1 bg-dark-card px-2 py-1 rounded border border-dark-border text-sm" />
																	<input type="number" bind:value={set.reps} placeholder="reps"
																		class="flex-1 bg-dark-card px-2 py-1 rounded border border-dark-border text-sm" />
																	<button onclick={() => removeEditExerciseInitialSet(slot.exerciseId, i)}
																		class="text-danger text-xs">×</button>
																</div>
															{/each}
															<button onclick={() => addEditExerciseInitialSet(slot.exerciseId)} class="text-accent text-xs">
																+ Add set
															</button>
														</div>
													{/if}
												</div>
											{/if}
											{#each slot.alternateExercises as alt}
												{#if editSlotExerciseStates[alt.id]}
													{@const alternateState = editSlotExerciseStates[alt.id]}
													<div class="rounded-lg border border-dark-border p-3 space-y-2">
														<p class="text-sm font-medium">{alt.name}</p>
														<div class="flex gap-2">
															<div class="flex-1">
																<label class="text-xs text-text-muted">Current weight (kg)</label>
																<input type="number" bind:value={alternateState.initialWeight} placeholder="0" step="0.5"
																	class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
															</div>
															<div class="flex-1">
																<label class="text-xs text-text-muted">Current reps</label>
																<input type="number" bind:value={alternateState.initialReps} placeholder="8"
																	class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
															</div>
														</div>
														<label class="flex items-center gap-2 text-xs text-text-secondary">
															<input type="checkbox" bind:checked={alternateState.usePerSet} class="accent-accent" />
															Per-set current values
														</label>
														{#if alternateState.usePerSet}
															<div class="space-y-2">
																{#each alternateState.initialSets as set, i}
																	<div class="flex gap-2 items-center">
																		<span class="text-xs text-text-muted w-6">S{i + 1}</span>
																		<input type="number" bind:value={set.weight} placeholder="kg" step="0.5"
																			class="flex-1 bg-dark-card px-2 py-1 rounded border border-dark-border text-sm" />
																		<input type="number" bind:value={set.reps} placeholder="reps"
																			class="flex-1 bg-dark-card px-2 py-1 rounded border border-dark-border text-sm" />
																		<button onclick={() => removeEditExerciseInitialSet(alt.id, i)}
																			class="text-danger text-xs">×</button>
																	</div>
																{/each}
																<button onclick={() => addEditExerciseInitialSet(alt.id)} class="text-accent text-xs">
																	+ Add set
																</button>
															</div>
														{/if}
													</div>
												{/if}
											{/each}
										</div>
									{:else}
										<div class="flex gap-2">
											<div class="flex-1">
												<label class="text-xs text-text-muted">Current weight (kg)</label>
												<input type="number" bind:value={editSlotInitialWeight} placeholder="0" step="0.5"
													class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
											</div>
											<div class="flex-1">
												<label class="text-xs text-text-muted">Current reps</label>
												<input type="number" bind:value={editSlotInitialReps} placeholder="8"
													class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
											</div>
										</div>

										<label class="flex items-center gap-2 text-xs text-text-secondary">
											<input type="checkbox" bind:checked={editSlotUsePerSet} class="accent-accent" />
											Per-set current values
										</label>

										{#if editSlotUsePerSet}
											<div class="space-y-2">
												{#each editSlotInitialSets as set, i}
													<div class="flex gap-2 items-center">
														<span class="text-xs text-text-muted w-6">S{i + 1}</span>
														<input type="number" bind:value={set.weight} placeholder="kg" step="0.5"
															class="flex-1 bg-dark-card px-2 py-1 rounded border border-dark-border text-sm" />
														<input type="number" bind:value={set.reps} placeholder="reps"
															class="flex-1 bg-dark-card px-2 py-1 rounded border border-dark-border text-sm" />
														<button onclick={() => { editSlotInitialSets = editSlotInitialSets.filter((_, j) => j !== i); }}
															class="text-danger text-xs">×</button>
													</div>
												{/each}
												<button
													onclick={() => { editSlotInitialSets = [...editSlotInitialSets, { weight: editSlotInitialWeight ?? 0, reps: editSlotInitialReps ?? 8 }]; }}
													class="text-accent text-xs"
												>
													+ Add set
												</button>
											</div>
										{/if}
									{/if}

									<div class="flex gap-2">
										<button
											onclick={saveEditSlot}
											class="flex-1 bg-success hover:bg-green-600 text-white py-1.5 rounded text-sm font-medium transition-colors"
										>
											Save
										</button>
										<button
											onclick={() => editingSlotId = null}
											class="flex-1 bg-dark-card text-text-secondary py-1.5 rounded text-sm"
										>
											Cancel
										</button>
									</div>
								</div>
							{:else}
							<div class="flex items-center gap-2 p-2 bg-dark-surface rounded-lg text-sm">
								<span class="text-text-muted w-5 text-xs">{slotIndex + 1}.</span>
								<div class="flex-1">
									<span>{slot.exercise?.name ?? 'Unknown'}</span>
									{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
										<span class="text-warning"> ↔ {slot.alternateExercises.map(e => e.name).join(' ↔ ')}</span>
									{/if}
									{#if slot.incrementProfileId}
										{@const prof = profiles.find(p => p.id === slot.incrementProfileId)}
										{#if prof}
											<span class="text-xs text-accent ml-1">· {prof.name}</span>
										{/if}
									{/if}
									<div class="text-text-muted text-xs">
										{slot.targetSets} sets
										{#if slot.targetReps} · {slot.targetReps} reps{/if}
										{#if slot.type !== 'core'} · <span class="capitalize">{slot.type}</span>{/if}
										{#if slot.restSeconds} · {slot.restSeconds}s rest{/if}
										{#if slot.repTarget} · {slot.repTarget} rep goal{/if}
									</div>
									{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
										{#if slot.exercise}
											{@const primarySummary = getExerciseCurrentSummary(slot, slot.exerciseId)}
											{#if primarySummary}
												<div class="text-text-muted text-xs">{slot.exercise.name}: {primarySummary}</div>
											{/if}
										{/if}
										{#each slot.alternateExercises as alt}
											{@const alternateSummary = getExerciseCurrentSummary(slot, alt.id)}
											{#if alternateSummary}
												<div class="text-text-muted text-xs">{alt.name}: {alternateSummary}</div>
											{/if}
										{/each}
									{:else}
										{#if slot.initialWeight !== undefined || slot.initialReps !== undefined}
											<div class="text-text-muted text-xs">Current: {slot.initialWeight ?? 0}kg × {slot.initialReps ?? '?'} reps</div>
										{/if}
										{#if slot.initialSets && slot.initialSets.length > 0}
											<div class="text-text-muted text-xs">Current sets: {slot.initialSets.map(s => `${s.weight}kg×${s.reps}`).join(', ')}</div>
										{/if}
									{/if}
								</div>
									{#if slot.deloadWeight !== undefined}
										<span class="text-warning text-xs" title="Deload queued">⚡</span>
									{/if}
									<button onclick={() => startDeload(slot)} class="text-text-muted hover:text-warning text-xs">Deload</button>
									<button onclick={() => startEditSlot(slot)} class="text-accent text-xs">Edit</button>
									<button onclick={() => handleDeleteSlot(slot.id)} class="text-danger text-xs">×</button>
								</div>
								{#if slot.deloadWeight !== undefined && deloadingSlotId !== slot.id}
									<div class="mt-1 text-xs text-warning px-2">
										⚡ Deload queued: {slot.deloadWeight}kg × {slot.deloadReps ?? 6} reps
										<button onclick={() => clearDeload(slot.id)} class="text-danger ml-1">clear</button>
									</div>
								{/if}
								{#if deloadingSlotId === slot.id}
									<div class="mt-2 rounded-lg border border-warning/50 bg-dark-surface p-3 space-y-3">
										<p class="text-xs text-warning">Next session will use these values instead of the progression.</p>
										<div class="flex gap-2">
											<div class="flex-1">
												<label class="text-xs text-text-muted">Weight (kg)</label>
												<input type="number" bind:value={deloadWeightValue} min="0" step="0.5"
													class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
											</div>
											<div class="flex-1">
												<label class="text-xs text-text-muted">Target reps</label>
												<input type="number" bind:value={deloadRepsValue} min="1" max="50"
													class="w-full bg-dark-card px-2 py-1.5 rounded border border-dark-border text-sm" />
											</div>
										</div>
										<div class="flex gap-2">
											<button onclick={() => handleDeload(slot.id)} disabled={deloadWeightValue === undefined}
												class="flex-1 bg-warning/20 hover:bg-warning/30 text-warning py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50">
												Set deload
											</button>
											<button onclick={() => deloadingSlotId = null}
												class="px-4 bg-dark-card text-text-secondary py-1.5 rounded text-sm">
												Cancel
											</button>
										</div>
									</div>
								{/if}
							{/if}
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

						<!-- Weight Profile -->
						{#if profiles.length > 0}
							<div>
								<label class="text-xs text-text-muted">Weight profile</label>
								<select
									bind:value={newSlotProfileId}
									class="w-full bg-dark-surface text-text-primary px-3 py-1.5 rounded border border-dark-border text-sm"
								>
									<option value="">None (use increments)</option>
									{#each profiles as p}
										<option value={p.id}>{p.name} ({p.weights[0]}–{p.weights[p.weights.length - 1]} kg)</option>
									{/each}
								</select>
							</div>
						{/if}

						<div class="flex gap-2">
							<div class="flex-1">
								<label class="text-xs text-text-muted">Rep goal</label>
								<input type="number" bind:value={newSlotRepTarget} min="1" placeholder={String(settings.defaultRepTarget)}
									class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
							</div>
							<div class="flex-1">
								<label class="text-xs text-text-muted">Weight increments</label>
								<input type="text" bind:value={newSlotWeightIncrements} placeholder="e.g. 1, 1.5, 2"
									class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
							</div>
						</div>

						<!-- Initial Weight/Reps -->
						<div class="flex gap-2">
							<div class="flex-1">
								<label class="text-xs text-text-muted">Current weight (kg)</label>
								<input type="number" bind:value={newSlotInitialWeight} placeholder="0" step="0.5"
									class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
							</div>
							<div class="flex-1">
								<label class="text-xs text-text-muted">Current reps</label>
								<input type="number" bind:value={newSlotInitialReps} placeholder="8"
									class="w-full bg-dark-surface px-2 py-1.5 rounded border border-dark-border text-sm" />
							</div>
						</div>

						<label class="flex items-center gap-2 text-xs text-text-secondary">
							<input type="checkbox" bind:checked={newSlotUsePerSet} class="accent-accent" />
							Per-set current values
						</label>

						{#if newSlotUsePerSet}
							<div class="space-y-2">
								{#each newSlotInitialSets as set, i}
									<div class="flex gap-2 items-center">
										<span class="text-xs text-text-muted w-6">S{i + 1}</span>
										<input type="number" bind:value={set.weight} placeholder="kg" step="0.5"
											class="flex-1 bg-dark-surface px-2 py-1 rounded border border-dark-border text-sm" />
										<input type="number" bind:value={set.reps} placeholder="reps"
											class="flex-1 bg-dark-surface px-2 py-1 rounded border border-dark-border text-sm" />
										<button onclick={() => { newSlotInitialSets = newSlotInitialSets.filter((_, j) => j !== i); }}
											class="text-danger text-xs">×</button>
									</div>
								{/each}
								<button
									onclick={() => { newSlotInitialSets = [...newSlotInitialSets, { weight: newSlotInitialWeight ?? 0, reps: newSlotInitialReps ?? 8 }]; }}
									class="text-accent text-xs"
								>
									+ Add set
								</button>
							</div>
						{/if}

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
					<label class="text-xs text-text-muted">Default rep goal (optional, overrides global)</label>
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
