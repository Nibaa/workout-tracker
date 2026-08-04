<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		getSetLogs, updateSetLog, finishExerciseLog, getExercise, getSettings,
		getIncrementProfile, getNextWeightInProfile, getPrevWeightInProfile, getLastPerformance,
		isMyoRepSlot, getExerciseLogs, getExerciseSlots, createExerciseLog, createSetLog,
		planExerciseTargets, getAlternatingExerciseId, updateExerciseSlot
	} from '$lib/store';
	import { db } from '$lib/db';
	import type { ExerciseLog, SetLog, Exercise, ExerciseSlot, Settings, IncrementProfile, WorkoutSession } from '$lib/types';

	let exerciseLog = $state<ExerciseLog | undefined>();
	let exercise = $state<Exercise | undefined>();
	let slot = $state<ExerciseSlot | undefined>();
	let sets = $state<SetLog[]>([]);
	let currentSetIndex = $state(0);
	let loading = $state(true);
	let settings = $state<Settings>(getSettings());
	let profile = $state<IncrementProfile | undefined>();
	let previousPerformance = $state<{ weight: number; reps: number; sets: SetLog[] } | null>(null);
	let showTargetAdjustmentPrompt = $state(false);
	let adjustedTargetReps = $state<number | undefined>();
	let exerciseName = $state('');
	let isBodyweight = $state(false);

	// Rest timer
	let restActive = $state(false);
	let restRemaining = $state(0);
	let restTimer: ReturnType<typeof setInterval>;

	// Input state for current set
	let inputWeight = $state(0);
	let inputReps = $state<number | undefined>();

	const sessionId = $derived($page.params.id ?? '');
	const logId = $derived($page.params.logId ?? '');
	let loadedLogId = $state('');

	$effect(() => {
		if (sets.length > 0 && currentSetIndex < sets.length) {
			const set = sets[currentSetIndex];
			inputWeight = set.targetWeight;
			inputReps = set.targetReps; // Auto-fill with target reps (user can change)
		}
	});

	onMount(async () => {
		settings = getSettings();
		await loadData();
	});

	$effect(() => {
		if (!logId || loading || loadedLogId === logId) return;
		void loadData();
	});

	onDestroy(() => {
		clearInterval(restTimer);
	});

	async function loadData() {
		loading = true;
		exerciseLog = await db.exerciseLogs.get(logId);
		if (!exerciseLog) { goto(`/workout/${sessionId}`); return; }
		const workoutSession = await db.workoutSessions.get(sessionId);

		exercise = exerciseLog.exerciseId ? await getExercise(exerciseLog.exerciseId) : undefined;
		exerciseName = exercise?.name ?? exerciseLog.customExerciseName ?? 'Custom exercise';
		isBodyweight = exercise?.isBodyweight ?? exerciseLog.customExerciseBodyweight ?? false;
		// Load slot for weight profile and increments
		if (exerciseLog.slotId) {
			slot = await db.exerciseSlots.get(exerciseLog.slotId);
		} else {
			slot = undefined;
		}
		if (slot?.incrementProfileId) {
			profile = await getIncrementProfile(slot.incrementProfileId);
		} else {
			profile = undefined;
		}
		sets = await getSetLogs(logId);
		if (workoutSession && exerciseLog.exerciseId) {
			previousPerformance = await getLastPerformance(exerciseLog.exerciseId, workoutSession.splitDayId);
		} else {
			previousPerformance = null;
		}

		// Find first incomplete set
		const firstIncomplete = sets.findIndex(s => !s.completed);
		currentSetIndex = firstIncomplete >= 0 ? firstIncomplete : sets.length - 1;

		loadedLogId = logId;
		loading = false;
	}

	async function completeSet() {
		if (inputReps === undefined || inputReps < 0) return;

		const set = sets[currentSetIndex];
		const completedSetIndex = currentSetIndex;
		await updateSetLog(set.id, {
			actualWeight: inputWeight,
			actualReps: inputReps,
			completed: true
		});

		sets[currentSetIndex] = {
			...set,
			actualWeight: inputWeight,
			actualReps: inputReps,
			completed: true
		};

		const nextSupersetLogId = await getNextSupersetLogId(completedSetIndex);
		if (nextSupersetLogId && nextSupersetLogId !== exerciseLog?.id) {
			goto(`/workout/${sessionId}/exercise/${nextSupersetLogId}`);
			return;
		}

		if (nextSupersetLogId === exerciseLog?.id) {
			const firstIncomplete = sets.findIndex(candidate => !candidate.completed);
			currentSetIndex = firstIncomplete >= 0 ? firstIncomplete : sets.length - 1;
			return;
		}

		// Move to next set or finish
		if (currentSetIndex < sets.length - 1) {
			currentSetIndex++;
			// Rest timer is manual-start, show the button but don't auto-start
		}
	}

	async function handleUpdateCompletedSet(setIndex: number, field: 'actualWeight' | 'actualReps', value: number) {
		const set = sets[setIndex];
		await updateSetLog(set.id, { [field]: value });
		sets[setIndex] = { ...set, [field]: value };
	}

	async function handleToggleSetCompleted(setIndex: number) {
		const set = sets[setIndex];
		const nextCompleted = !set.completed;
		await updateSetLog(set.id, { completed: nextCompleted });
		sets[setIndex] = { ...set, completed: nextCompleted };
		if (!nextCompleted) {
			currentSetIndex = setIndex;
		}
	}

	function startRestTimer() {
		restActive = true;
		// Use exercise-specific rest or default
		restRemaining = slot?.restSeconds ?? settings.defaultRestSeconds;
		clearInterval(restTimer);
		restTimer = setInterval(() => {
			restRemaining--;
			if (restRemaining <= 0) {
				clearInterval(restTimer);
				restActive = false;
				// Vibrate if available
				if (typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate([200, 100, 200]);
				}
			}
		}, 1000);
	}

	function skipRest() {
		clearInterval(restTimer);
		restActive = false;
		restRemaining = 0;
	}

	function getCompletedWorkingSets(): SetLog[] {
		return sets.filter(set => set.completed && !set.isWarmup);
	}

	function hasPerformanceDrop(): boolean {
		if (!previousPerformance || previousPerformance.sets.length === 0) return false;
		const previousSets = previousPerformance.sets;
		const currentSets = getCompletedWorkingSets();
		const comparableSetCount = Math.min(previousSets.length, currentSets.length);
		let heavierThanPrevious = false;

		for (let index = 0; index < comparableSetCount; index++) {
			const previousWeight = previousSets[index].actualWeight ?? previousSets[index].targetWeight;
			const currentWeight = currentSets[index].actualWeight ?? currentSets[index].targetWeight;
			if (currentWeight > previousWeight) {
				heavierThanPrevious = true;
			}

			const previousReps = previousSets[index].actualReps ?? previousSets[index].targetReps;
			const currentReps = currentSets[index].actualReps ?? currentSets[index].targetReps;
			if (currentReps < previousReps) {
				return !heavierThanPrevious;
			}
		}

		return false;
	}

	function getSuggestedAdjustedTargetReps(): number {
		const completedSets = getCompletedWorkingSets();
		if (completedSets.length === 0) return 1;
		return Math.max(1, ...completedSets.map(set => set.actualReps ?? set.targetReps));
	}

	async function persistAdjustedSessionTarget(newTargetReps: number) {
		for (const set of sets) {
			await updateSetLog(set.id, { targetReps: newTargetReps });
		}

		sets = sets.map(set => ({
			...set,
			targetReps: newTargetReps
		}));
	}

	async function finalizeExercise() {
		if (!exerciseLog) return;
		await finishExerciseLog(exerciseLog.id);
		const nextSupersetLogId = await getNextSupersetLogId();
		if (nextSupersetLogId && nextSupersetLogId !== exerciseLog.id) {
			goto(`/workout/${sessionId}/exercise/${nextSupersetLogId}`);
			return;
		}
		goto(`/workout/${sessionId}`);
	}

	async function finishExercise() {
		if (!exerciseLog) return;
		if (allDone && !isMyoRep && hasPerformanceDrop()) {
			adjustedTargetReps = getSuggestedAdjustedTargetReps();
			showTargetAdjustmentPrompt = true;
			return;
		}
		await finalizeExercise();
	}

	async function keepCurrentSessionTarget() {
		showTargetAdjustmentPrompt = false;
		await finalizeExercise();
	}

	async function applyAdjustedSessionTarget() {
		if (adjustedTargetReps === undefined || adjustedTargetReps < 1) return;
		await persistAdjustedSessionTarget(adjustedTargetReps);
		showTargetAdjustmentPrompt = false;
		await finalizeExercise();
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${String(s).padStart(2, '0')}`;
	}

	function getSetLabel(setIndex: number): string {
		if (!slot || !isMyoRepSlot(slot)) {
			return `Set ${sets[setIndex]?.setNumber ?? setIndex + 1}`;
		}

		if (setIndex === 0) {
			return 'Activation set';
		}

		const totalMiniSets = Math.max(1, sets.length - 1);
		return `Mini-set ${setIndex} of ${totalMiniSets}`;
	}

	function getRepsTargetLabel(setIndex: number): string {
		if (!slot || !isMyoRepSlot(slot)) {
			return 'Session target';
		}

		return setIndex === 0 ? 'Activation target' : 'Mini-set target';
	}

	function getMyoRepSummary(): string | null {
		if (!slot || !isMyoRepSlot(slot)) return null;
		const activationTarget = slot.myoActivationTargetReps ?? sets[0]?.targetReps;
		const miniSetTarget = slot.myoMiniSetTargetReps ?? sets[1]?.targetReps;
		const miniSetCount = slot.myoMiniSetCount ?? Math.max(1, sets.length - 1);

		if (!activationTarget || !miniSetTarget) return 'Myoreps';
		return `${activationTarget} activation + ${miniSetTarget}×${miniSetCount} mini-sets`;
	}

	function getSupersetSummary(): string | null {
		if (!slot?.supersetGroup) return null;
		return 'Superset exercise';
	}

	async function getNextSupersetLogId(completedSetIndex?: number): Promise<string | null> {
		if (!exerciseLog?.slotId || !slot?.supersetGroup || !sessionId) {
			return null;
		}

		const workoutSession = await db.workoutSessions.get(sessionId);
		if (!workoutSession) {
			return null;
		}

		const supersetSlots = (await getExerciseSlots(workoutSession.splitDayId))
			.filter(candidate => candidate.supersetGroup === slot?.supersetGroup)
			.sort((left, right) => left.order - right.order);

		if (supersetSlots.length < 2) {
			return null;
		}

		const currentSlotIndex = supersetSlots.findIndex(candidate => candidate.id === slot?.id);
		if (currentSlotIndex < 0) {
			return null;
		}

		const logs = await getExerciseLogs(workoutSession.id);

		if (completedSetIndex !== undefined) {
			for (let offset = 1; offset < supersetSlots.length; offset++) {
				const candidateSlot = supersetSlots[(currentSlotIndex + offset) % supersetSlots.length];
				const candidateLog = await findOrCreateSupersetLog(candidateSlot, workoutSession, logs);
				const candidateSets = await getSetLogs(candidateLog.id);
				const candidateSet = candidateSets[completedSetIndex];
				if (candidateSet && !candidateSet.completed) {
					return candidateLog.id;
				}
			}
		}

		for (const candidateSlot of supersetSlots) {
			const candidateLog = await findOrCreateSupersetLog(candidateSlot, workoutSession, logs);
			const candidateSets = await getSetLogs(candidateLog.id);
			if (candidateSets.some(candidate => !candidate.completed)) {
				return candidateLog.id;
			}
		}

		return null;
	}

	async function findOrCreateSupersetLog(
		candidateSlot: ExerciseSlot,
		workoutSession: WorkoutSession,
		existingLogs: ExerciseLog[]
	): Promise<ExerciseLog> {
		const existingLog = existingLogs.find(candidate => candidate.slotId === candidateSlot.id);
		if (existingLog) {
			return existingLog;
		}

		const exerciseId = candidateSlot.type === 'alternating'
			? await getAlternatingExerciseId(candidateSlot, workoutSession.splitDayId)
			: candidateSlot.exerciseId;
		const splitDay = await db.splitDays.get(workoutSession.splitDayId);
		const log = await createExerciseLog({
			sessionId: workoutSession.id,
			exerciseId,
			slotId: candidateSlot.id,
			order: getNextSupersetLogOrder(existingLogs)
		});
		const plannedSets = await planExerciseTargets(
			candidateSlot,
			exerciseId,
			workoutSession.splitDayId,
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

		if (candidateSlot.deloadWeight !== undefined) {
			await updateExerciseSlot(candidateSlot.id, { deloadWeight: undefined, deloadReps: undefined });
		}

		existingLogs.push(log);
		return log;
	}

	function getNextSupersetLogOrder(existingLogs: ExerciseLog[]): number {
		return existingLogs.reduce((maxOrder, candidate) => Math.max(maxOrder, candidate.order), -1) + 1;
	}

	const completedCount = $derived(sets.filter(s => s.completed).length);
	const currentSet = $derived(sets[currentSetIndex]);
	const allDone = $derived(sets.length > 0 && sets.every(s => s.completed));
	const isMyoRep = $derived(slot ? isMyoRepSlot(slot) : false);
</script>

<div class="max-w-lg mx-auto px-4 pt-4">
	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if exerciseLog}
		<!-- Header -->
		<div class="flex items-center justify-between mb-5">
			<div>
				<h1 class="text-xl font-bold">{exerciseName}</h1>
				<span class="text-text-muted text-sm">
					{completedCount}/{sets.length} sets
					{#if isBodyweight}
						· Bodyweight
					{/if}
				</span>
				{#if exercise?.notes}
					<p class="text-text-secondary text-xs mt-1">{exercise.notes}</p>
				{/if}
				{#if getMyoRepSummary()}
					<p class="text-text-secondary text-xs mt-1">{getMyoRepSummary()}</p>
				{/if}
				{#if getSupersetSummary()}
					<p class="text-text-secondary text-xs mt-1">{getSupersetSummary()}</p>
				{/if}
			</div>
			<button
				onclick={finishExercise}
				class="text-danger text-sm font-medium"
			>
				{allDone ? 'Done' : 'End Early'}
			</button>
		</div>

		{#if showTargetAdjustmentPrompt}
			<div class="bg-dark-card rounded-xl p-4 mb-4 border border-warning">
				<p class="text-sm font-medium mb-2">Performance dipped compared with your last workout.</p>
				<p class="text-xs text-text-secondary mb-3">
					Keep the current session target for next time, or reset it to a new default.
				</p>
				<div class="mb-3">
					<p class="block text-xs text-text-secondary mb-2">New session target reps</p>
					<input
						type="number"
						bind:value={adjustedTargetReps}
						min="1"
						aria-label="New session target reps"
						class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
					/>
					<p class="text-xs text-text-muted mt-1">Suggested reset: {getSuggestedAdjustedTargetReps()} reps</p>
				</div>
				<div class="flex gap-2">
					<button
						onclick={keepCurrentSessionTarget}
						class="flex-1 bg-dark-surface text-text-secondary py-2 rounded-lg text-sm font-medium"
					>
						Keep current session target
					</button>
					<button
						onclick={applyAdjustedSessionTarget}
						class="flex-1 bg-warning hover:bg-yellow-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
					>
						Use new session target
					</button>
				</div>
			</div>
		{/if}

		<!-- Rest Timer Overlay -->
		{#if restActive}
			<div class="bg-dark-card rounded-xl p-6 mb-4 border border-accent text-center">
				<p class="text-text-secondary text-sm mb-2">Rest</p>
				<p class="text-5xl font-bold text-accent mb-4">{formatTime(restRemaining)}</p>
				<button
					onclick={skipRest}
					class="text-text-secondary text-sm underline"
				>
					Skip rest
				</button>
			</div>
		{:else if completedCount > 0 && !allDone}
			<button
				onclick={startRestTimer}
				class="w-full bg-dark-card text-accent py-3 rounded-xl border border-dark-border hover:border-accent transition-colors mb-4 text-sm font-medium"
			>
				Start Rest Timer ({slot?.restSeconds ?? settings.defaultRestSeconds}s)
			</button>
		{/if}

		<!-- Completed Sets -->
		{#if completedCount > 0}
			<div class="mb-4 space-y-2">
				{#each sets as set, i}
					{#if set.completed}
						<div class="p-3 bg-dark-surface rounded-lg border border-dark-border space-y-2">
							<div class="flex items-center justify-between gap-3">
								<span class="text-sm font-medium">{getSetLabel(i)}</span>
								<button onclick={() => handleToggleSetCompleted(i)} class="text-xs text-warning">Mark unfinished</button>
							</div>
							<div class="flex items-center gap-2">
								{#if !isBodyweight}
									<div class="flex-1">
										<span class="text-[10px] text-text-muted block">kg</span>
										<input
											type="number"
											value={set.actualWeight ?? set.targetWeight}
											onchange={(e) => handleUpdateCompletedSet(i, 'actualWeight', Number(e.currentTarget.value))}
											step="0.5"
											min="0"
											aria-label={`Completed ${getSetLabel(i)} weight in kilograms`}
											class="w-full bg-dark-card text-sm text-center py-1 rounded border border-dark-border focus:border-accent focus:outline-none"
										/>
									</div>
								{/if}
								<div class="flex-1">
									<span class="text-[10px] text-text-muted block">reps</span>
									<input
										type="number"
										value={set.actualReps ?? set.targetReps}
										onchange={(e) => handleUpdateCompletedSet(i, 'actualReps', Number(e.currentTarget.value))}
										min="0"
										aria-label={`Completed ${getSetLabel(i)} reps`}
										class="w-full bg-dark-card text-sm text-center py-1 rounded border border-dark-border focus:border-accent focus:outline-none"
									/>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}

		<!-- Current Set Input -->
		{#if !allDone && currentSet}
			<div class="bg-dark-card rounded-xl p-5 border border-dark-border">
				<h3 class="text-sm text-text-muted mb-4">{getSetLabel(currentSetIndex)} of {sets.length}</h3>

				<!-- Weight Input -->
				{#if !isBodyweight}
					<div class="mb-4">
						<p class="block text-xs text-text-secondary mb-2">Weight (kg)</p>
						<div class="flex items-center gap-3">
							<button
								onclick={() => {
									if (profile) {
										const prev = getPrevWeightInProfile(inputWeight, profile);
										inputWeight = prev ?? 0;
									} else {
										inputWeight = Math.max(0, inputWeight - (slot?.weightIncrements?.[0] ?? settings.defaultWeightIncrement));
									}
								}}
								class="w-12 h-12 bg-dark-surface rounded-lg text-xl font-bold text-text-secondary hover:text-text-primary transition-colors"
							>−</button>
							<input
								type="number"
								bind:value={inputWeight}
								step="0.5"
								min="0"
								aria-label={`${getSetLabel(currentSetIndex)} weight in kilograms`}
								class="flex-1 bg-dark-surface text-center text-2xl font-bold py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
							/>
							<button
								onclick={() => {
									if (profile) {
										const next = getNextWeightInProfile(inputWeight, profile);
										if (next !== undefined) inputWeight = next;
									} else {
										inputWeight += (slot?.weightIncrements?.[0] ?? settings.defaultWeightIncrement);
									}
								}}
								class="w-12 h-12 bg-dark-surface rounded-lg text-xl font-bold text-text-secondary hover:text-text-primary transition-colors"
							>+</button>
						</div>
						{#if currentSet.targetWeight > 0}
							<p class="text-xs text-text-muted text-center mt-1">{getRepsTargetLabel(currentSetIndex)} weight: {currentSet.targetWeight}kg</p>
						{/if}
					</div>
				{/if}

				<!-- Reps Input -->
				<div class="mb-5">
					<p class="block text-xs text-text-secondary mb-2">Reps</p>
					<div class="flex items-center gap-3">
						<button
							onclick={() => { if (inputReps !== undefined) inputReps = Math.max(0, inputReps - 1); }}
							class="w-12 h-12 bg-dark-surface rounded-lg text-xl font-bold text-text-secondary hover:text-text-primary transition-colors"
						>−</button>
						<input
							type="number"
							bind:value={inputReps}
							placeholder="reps"
							min="0"
							aria-label={`${getSetLabel(currentSetIndex)} reps`}
							class="flex-1 bg-dark-surface text-center text-2xl font-bold py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none placeholder:text-text-muted"
						/>
						<button
							onclick={() => inputReps = (inputReps ?? 0) + 1}
							class="w-12 h-12 bg-dark-surface rounded-lg text-xl font-bold text-text-secondary hover:text-text-primary transition-colors"
						>+</button>
					</div>
					<p class="text-xs text-text-muted text-center mt-1">{getRepsTargetLabel(currentSetIndex)}: {currentSet.targetReps} reps</p>
				</div>

				<button
					onclick={completeSet}
					disabled={inputReps === undefined}
					class="w-full bg-accent hover:bg-accent-hover disabled:bg-dark-surface disabled:text-text-muted text-white font-bold py-3.5 rounded-lg transition-colors"
				>
					Complete Set
				</button>
			</div>
		{:else if allDone}
			<div class="bg-dark-card rounded-xl p-5 text-center">
				<p class="text-success text-lg font-bold mb-2">All sets completed! 💪</p>
				<button
					onclick={finishExercise}
					class="w-full bg-success hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors"
				>
					Back to Workout
				</button>
			</div>
		{/if}

		<!-- Remaining Sets Preview -->
		{#if !allDone}
			<div class="mt-4 space-y-1">
				{#each sets as set, i}
					{#if !set.completed && i > currentSetIndex}
						<div class="flex items-center gap-3 p-2 text-text-muted text-xs">
							<span class="w-6">○</span>
							<span>{getSetLabel(i)}: session target {set.targetWeight}kg × {set.targetReps} reps</span>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	{/if}
</div>
