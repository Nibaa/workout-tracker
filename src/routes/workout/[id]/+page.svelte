<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		getExerciseSlots, getExerciseLogs, getExercise, getSetLogs,
		finishWorkoutSession, createExerciseLog, getAlternatingExerciseId,
		createSetLog, getSettings, getAllExerciseIdsForSlot,
		deleteWorkoutSession, planExerciseTargets, type PlannedExerciseSet
	} from '$lib/store';
	import { db } from '$lib/db';
	import type { WorkoutSession, SplitDay, ExerciseSlot, ExerciseLog, SetLog, Exercise, Settings } from '$lib/types';

	type SessionExerciseLog = ExerciseLog & { sets: SetLog[]; exercise?: Exercise };

	let session = $state<WorkoutSession | undefined>();
	let splitDay = $state<SplitDay | undefined>();
	let slots = $state<Array<ExerciseSlot & {
		exercise?: Exercise;
		alternateExercises?: Exercise[];
		suggestedExerciseId?: string;
		previewTargetsByExerciseId?: Record<string, PlannedExerciseSet[]>;
		logs?: SessionExerciseLog[];
		activeLog?: SessionExerciseLog;
		completedLogs?: SessionExerciseLog[];
		availableExerciseIds?: string[];
		done?: boolean;
		started?: boolean;
	}>>([]);
	let extraLogs = $state<SessionExerciseLog[]>([]);
	let loading = $state(true);
	let elapsed = $state('00:00');
	let timer: ReturnType<typeof setInterval>;
	let settings = $state<Settings>(getSettings());
	let showAddCustomExercise = $state(false);
	let customExerciseName = $state('');
	let customExerciseSets = $state(3);
	let customExerciseReps = $state<number | undefined>(8);
	let customExerciseWeight = $state<number | undefined>(0);
	let customExerciseBodyweight = $state(false);

	const sessionId = $derived($page.params.id ?? '');

	onMount(async () => {
		settings = getSettings();
		await loadSession();
		timer = setInterval(updateElapsed, 1000);
	});

	onDestroy(() => {
		clearInterval(timer);
	});

	function updateElapsed() {
		if (!session) return;
		const diff = Date.now() - new Date(session.startedAt).getTime();
		const mins = Math.floor(diff / 60000);
		const secs = Math.floor((diff % 60000) / 1000);
		elapsed = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}

	async function loadSession() {
		loading = true;
		if (!sessionId) { goto('/'); return; }
		session = await db.workoutSessions.get(sessionId);
		if (!session) { goto('/'); return; }

		const currentSplitDay = await db.splitDays.get(session.splitDayId);
		if (!currentSplitDay) { goto('/'); return; }
		splitDay = currentSplitDay;

		const rawSlots = await getExerciseSlots(currentSplitDay.id);
		const existingLogs = await getExerciseLogs(session.id);
		extraLogs = await Promise.all(existingLogs
			.filter(log => !log.slotId)
			.map(async (log) => ({
				...log,
				exercise: log.exerciseId ? await getExercise(log.exerciseId) : undefined,
				sets: await getSetLogs(log.id)
			})));

		slots = await Promise.all(rawSlots.map(async (slot) => {
			const exercise = await getExercise(slot.exerciseId);
			const allExerciseIds = getAllExerciseIdsForSlot(slot);
			const altIds = getAllExerciseIdsForSlot(slot).slice(1);
			const alternateExercises = (await Promise.all(altIds.map(id => getExercise(id)))).filter((e): e is Exercise => !!e);
			let suggestedExerciseId = slot.exerciseId;

			if (slot.type === 'alternating' && altIds.length > 0) {
				suggestedExerciseId = await getAlternatingExerciseId(slot, currentSplitDay.id);
			}

			const logs = await Promise.all(existingLogs
				.filter(log => log.slotId === slot.id)
				.map(async (log) => ({
					...log,
					exercise: await getExercise(log.exerciseId),
					sets: await getSetLogs(log.id)
				})));
			const activeLog = logs.find(log => log.finishedAt == null);
			const completedLogs = logs.filter(log => log.finishedAt != null);
			const availableExerciseIds = allExerciseIds.filter(exerciseId => !logs.some(log => log.exerciseId === exerciseId));
			const previewTargetsByExerciseId = !activeLog
				? Object.fromEntries(await Promise.all(
					allExerciseIds.map(async (exerciseId) => ([
						exerciseId,
						await planExerciseTargets(slot, exerciseId, currentSplitDay.id, currentSplitDay.defaultRepTarget, settings)
					] as const))
				))
				: undefined;

			return {
				...slot,
				exercise,
				alternateExercises,
				suggestedExerciseId,
				previewTargetsByExerciseId,
				logs,
				activeLog,
				completedLogs,
				availableExerciseIds,
				done: completedLogs.length > 0,
				started: logs.length > 0
			};
		}));

		loading = false;
	}

	function getNextLogOrder(): number {
		return slots.reduce((count, currentSlot) => count + (currentSlot.logs?.length ?? 0), 0) + extraLogs.length;
	}

	async function startExercise(slot: typeof slots[0], exerciseId?: string) {
		if (!session) return;
		const eid = exerciseId ?? slot.suggestedExerciseId ?? slot.exerciseId;
		const nextOrder = getNextLogOrder();

		const log = await createExerciseLog({
			sessionId: session.id,
			exerciseId: eid,
			slotId: slot.id,
			order: nextOrder
		});

		const plannedSets = await planExerciseTargets(
			slot,
			eid,
			session.splitDayId,
			splitDay?.defaultRepTarget,
			settings
		);

		for (const plannedSet of plannedSets) {
			await createSetLog({
				exerciseLogId: log.id,
				setNumber: plannedSet.setNumber,
				targetWeight: plannedSet.targetWeight,
				targetReps: plannedSet.targetReps,
				isWarmup: false,
				completed: false
			});
		}

		goto(`/workout/${session.id}/exercise/${log.id}`);
	}

	async function handleFinishWorkout() {
		if (!session) return;
		await finishWorkoutSession(session.id);
		goto(`/workout/${session.id}/complete`);
	}

	async function handleAbandonWorkout() {
		if (!session) return;
		await deleteWorkoutSession(session.id);
		goto('/');
	}

	async function handleSkipExercise(slot: typeof slots[0]) {
		if (!session) return;
		// Create a log entry marked as finished immediately (skipped — 0 sets completed)
		const nextOrder = getNextLogOrder();
		const eid = slot.availableExerciseIds?.includes(slot.suggestedExerciseId ?? '')
			? slot.suggestedExerciseId
			: slot.availableExerciseIds?.[0] ?? slot.exerciseId;
		const log = await createExerciseLog({
			sessionId: session.id,
			exerciseId: eid,
			slotId: slot.id,
			order: nextOrder
		});
		// Mark as finished right away (no sets)
		await db.exerciseLogs.update(log.id, { finishedAt: new Date().toISOString() });
		await loadSession();
	}

	async function handleAddCustomExercise() {
		if (!session || !customExerciseName.trim()) return;

		const log = await createExerciseLog({
			sessionId: session.id,
			customExerciseName: customExerciseName.trim(),
			customExerciseBodyweight: customExerciseBodyweight,
			order: getNextLogOrder()
		});

		for (let index = 0; index < customExerciseSets; index++) {
			await createSetLog({
				exerciseLogId: log.id,
				setNumber: index + 1,
				targetWeight: customExerciseBodyweight ? 0 : (customExerciseWeight ?? 0),
				targetReps: customExerciseReps ?? settings.defaultRepTarget,
				isWarmup: false,
				completed: false
			});
		}

		showAddCustomExercise = false;
		customExerciseName = '';
		customExerciseSets = 3;
		customExerciseReps = 8;
		customExerciseWeight = 0;
		customExerciseBodyweight = false;

		goto(`/workout/${session.id}/exercise/${log.id}`);
	}

	let showAbandonConfirm = $state(false);

	function getSlotStatusColor(slot: typeof slots[0]): string {
		if (slot.activeLog) return 'border-warning';
		if (slot.done) return 'border-success';
		return 'border-dark-border';
	}

	function formatCompletedLogSummary(log: SessionExerciseLog, includeExerciseName: boolean): string {
		const completedSets = log.sets.filter(set => set.completed);
		const label = log.exercise?.name ?? log.customExerciseName ?? 'Custom exercise';
		const prefix = includeExerciseName ? `${label}: ` : '';

		if (completedSets.length === 0) {
			return `${prefix}Skipped`;
		}

		return `${prefix}${completedSets
			.map(set => `Set ${set.setNumber}: ${set.actualWeight ?? set.targetWeight}kg × ${set.actualReps ?? set.targetReps} reps`)
			.join(' · ')}`;
	}

	function getLogDisplayName(log: SessionExerciseLog): string {
		return log.exercise?.name ?? log.customExerciseName ?? 'Custom exercise';
	}

	function formatPlannedSetValue(plannedSet: PlannedExerciseSet): string {
		return plannedSet.targetWeight > 0
			? `${plannedSet.targetWeight}kg x ${plannedSet.targetReps}`
			: `${plannedSet.targetReps} reps`;
	}

	function formatPlannedSetSummary(plannedSets: PlannedExerciseSet[]): string {
		if (plannedSets.length === 0) return 'No target';
		const [firstSet] = plannedSets;
		const uniform = plannedSets.every(set =>
			set.targetWeight === firstSet.targetWeight && set.targetReps === firstSet.targetReps
		);

		if (uniform) {
			const summary = formatPlannedSetValue(firstSet);
			return plannedSets.length > 1 ? `${summary} for ${plannedSets.length} sets` : summary;
		}

		return plannedSets.map(set => `S${set.setNumber} ${formatPlannedSetValue(set)}`).join(' · ');
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-4">
	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if session && splitDay}
		<div class="flex items-center justify-between mb-5">
			<div>
				<h1 class="text-xl font-bold">{splitDay.name}</h1>
				<span class="text-text-muted text-sm">Duration: {elapsed}</span>
			</div>
			<div class="flex gap-2">
				<button
					onclick={() => showAbandonConfirm = true}
					class="text-text-muted hover:text-danger text-sm px-2 py-2 transition-colors"
				>
					Abandon
				</button>
				<button
					onclick={handleFinishWorkout}
					class="bg-danger hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
				>
					Finish
				</button>
			</div>
		</div>

		{#if showAbandonConfirm}
			<div class="bg-danger/10 rounded-xl p-4 border border-danger mb-4">
				<p class="text-sm text-danger font-medium mb-3">Abandon this workout? All logged data will be deleted.</p>
				<div class="flex gap-2">
					<button
						onclick={handleAbandonWorkout}
						class="flex-1 bg-danger text-white py-2 rounded-lg text-sm font-medium"
					>
						Abandon
					</button>
					<button
						onclick={() => showAbandonConfirm = false}
						class="flex-1 bg-dark-surface text-text-secondary py-2 rounded-lg text-sm font-medium"
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<div class="space-y-3">
			{#each slots as slot}
				<div class="bg-dark-card rounded-xl p-4 border-l-4 {getSlotStatusColor(slot)}">
					<div class="flex items-center justify-between mb-2">
						<div>
							<span class="font-medium">{slot.exercise?.name ?? 'Unknown'}</span>
							{#if slot.type === 'optional'}
								<span class="text-text-muted text-xs ml-1">(optional)</span>
							{/if}
						</div>
						{#if slot.activeLog}
							<span class="text-warning text-sm">In progress</span>
						{:else if slot.done}
							<span class="text-success text-sm">✓ Done</span>
						{/if}
					</div>

					<div class="text-text-secondary text-xs mb-3">
						{slot.targetSets} sets
						{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
							· alternates with {slot.alternateExercises.map(e => e.name).join(', ')}
						{/if}
						{#if slot.supersetGroup}
							· superset
						{/if}
					</div>

					{#if slot.completedLogs && slot.completedLogs.length > 0}
						<div class="space-y-1 mb-3">
							{#each slot.completedLogs as completedLog}
								<div class="flex items-start gap-2">
									<div class="flex-1 text-xs {completedLog.sets.filter(set => set.completed).length === 0 ? 'text-text-muted italic' : 'text-text-secondary'}">
										{formatCompletedLogSummary(completedLog, slot.type === 'alternating')}
									</div>
									<button
										onclick={() => goto(`/workout/${session!.id}/exercise/${completedLog.id}`)}
										class="text-accent text-xs"
									>
										Edit
									</button>
								</div>
							{/each}
						</div>
					{/if}

					{#if slot.activeLog}
						<!-- Resume -->
						<button
							onclick={() => goto(`/workout/${session!.id}/exercise/${slot.activeLog!.id}`)}
							class="w-full bg-warning/20 text-warning py-2 rounded-lg text-sm font-medium"
						>
							Resume
						</button>
					{:else if slot.availableExerciseIds && slot.availableExerciseIds.length > 0}
						<!-- Start exercise -->
						{#if slot.previewTargetsByExerciseId}
							<div class="space-y-1 mb-3">
								{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
									{#if slot.exercise && slot.availableExerciseIds.includes(slot.exerciseId) && slot.previewTargetsByExerciseId[slot.exerciseId]}
										<div class="text-xs {slot.suggestedExerciseId === slot.exerciseId ? 'text-accent' : 'text-text-muted'}">
											{slot.exercise.name}: {formatPlannedSetSummary(slot.previewTargetsByExerciseId[slot.exerciseId])}
										</div>
									{/if}
									{#each slot.alternateExercises as alt}
										{#if slot.availableExerciseIds.includes(alt.id) && slot.previewTargetsByExerciseId[alt.id]}
											<div class="text-xs {slot.suggestedExerciseId === alt.id ? 'text-accent' : 'text-text-muted'}">
												{alt.name}: {formatPlannedSetSummary(slot.previewTargetsByExerciseId[alt.id])}
											</div>
										{/if}
									{/each}
								{:else}
									{@const nextExerciseId = slot.availableExerciseIds[0]}
									{@const preview = nextExerciseId ? slot.previewTargetsByExerciseId[nextExerciseId] : undefined}
									{#if preview}
										<div class="text-xs text-text-muted">Session target: {formatPlannedSetSummary(preview)}</div>
									{/if}
								{/if}
							</div>
						{/if}
						<div class="flex gap-2 flex-wrap">
							{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
								{#if slot.availableExerciseIds.includes(slot.exerciseId)}
									<button
										onclick={() => startExercise(slot, slot.exerciseId)}
										class="flex-1 bg-accent/20 text-accent py-2 rounded-lg text-sm font-medium
											{slot.suggestedExerciseId === slot.exerciseId ? 'ring-1 ring-accent' : ''}"
									>
										{slot.exercise?.name}
									</button>
								{/if}
								{#each slot.alternateExercises as alt}
									{#if slot.availableExerciseIds.includes(alt.id)}
										<button
											onclick={() => startExercise(slot, alt.id)}
											class="flex-1 bg-accent/20 text-accent py-2 rounded-lg text-sm font-medium
												{slot.suggestedExerciseId === alt.id ? 'ring-1 ring-accent' : ''}"
										>
											{alt.name}
										</button>
									{/if}
								{/each}
							{:else}
								<button
									onclick={() => startExercise(slot)}
									class="flex-1 bg-accent hover:bg-accent-hover text-white py-2 rounded-lg text-sm font-medium transition-colors"
								>
									Start
								</button>
							{/if}
							<button
								onclick={() => handleSkipExercise(slot)}
								class="bg-dark-surface text-text-muted hover:text-text-secondary py-2 px-3 rounded-lg text-sm transition-colors"
							>
								Skip
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="mt-4 space-y-3">
			{#if extraLogs.length > 0}
				<div class="text-xs uppercase tracking-wide text-text-muted px-1">Extra Exercises</div>
				{#each extraLogs as log}
					<div class="bg-dark-card rounded-xl p-4 border-l-4 {log.finishedAt ? 'border-success' : 'border-warning'}">
						<div class="flex items-center justify-between mb-2">
							<div>
								<span class="font-medium">{getLogDisplayName(log)}</span>
								<span class="text-text-muted text-xs ml-1">(temporary)</span>
							</div>
							<span class="text-sm {log.finishedAt ? 'text-success' : 'text-warning'}">{log.finishedAt ? '✓ Done' : 'In progress'}</span>
						</div>
						<div class="text-text-secondary text-xs mb-3">
							{formatCompletedLogSummary(log, false)}
						</div>
						<button
							onclick={() => goto(`/workout/${session!.id}/exercise/${log.id}`)}
							class="w-full bg-dark-surface text-accent py-2 rounded-lg text-sm font-medium"
						>
							{log.finishedAt ? 'Edit' : 'Resume'}
						</button>
					</div>
				{/each}
			{/if}

			{#if showAddCustomExercise}
				<div class="bg-dark-card rounded-xl p-4 border border-accent space-y-3">
					<input
						type="text"
						bind:value={customExerciseName}
						placeholder="Exercise name"
						class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
					/>
					<div class="flex gap-2">
						<div class="flex-1">
							<label class="block text-xs text-text-secondary mb-1">Sets</label>
							<input type="number" bind:value={customExerciseSets} min="1" max="20" class="w-full bg-dark-surface px-3 py-2 rounded-lg border border-dark-border" />
						</div>
						<div class="flex-1">
							<label class="block text-xs text-text-secondary mb-1">Reps</label>
							<input type="number" bind:value={customExerciseReps} min="1" max="100" class="w-full bg-dark-surface px-3 py-2 rounded-lg border border-dark-border" />
						</div>
						<div class="flex-1">
							<label class="block text-xs text-text-secondary mb-1">Weight</label>
							<input type="number" bind:value={customExerciseWeight} min="0" step="0.5" disabled={customExerciseBodyweight}
								class="w-full bg-dark-surface px-3 py-2 rounded-lg border border-dark-border disabled:text-text-muted" />
						</div>
					</div>
					<label class="flex items-center gap-2 text-sm text-text-secondary">
						<input type="checkbox" bind:checked={customExerciseBodyweight} class="accent-accent" />
						Bodyweight exercise
					</label>
					<div class="flex gap-2">
						<button onclick={handleAddCustomExercise} disabled={!customExerciseName.trim()} class="flex-1 bg-accent hover:bg-accent-hover disabled:bg-dark-surface text-white py-2 rounded-lg text-sm font-medium transition-colors">
							Start custom exercise
						</button>
						<button onclick={() => showAddCustomExercise = false} class="px-4 bg-dark-surface text-text-secondary py-2 rounded-lg text-sm">
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<button
					onclick={() => showAddCustomExercise = true}
					class="w-full bg-dark-card text-accent py-3 rounded-xl border border-dashed border-dark-border hover:border-accent transition-colors"
				>
					+ Add Custom Exercise
				</button>
			{/if}
		</div>

		<button
			onclick={handleFinishWorkout}
			class="w-full mt-6 bg-success hover:bg-green-600 text-white font-bold py-3.5 rounded-lg transition-colors"
		>
			Finish Workout
		</button>
	{/if}
</div>
