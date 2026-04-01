<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getSetLogs, updateSetLog, finishExerciseLog, getExercise, getSettings, getIncrementProfile, getNextWeightInProfile, getPrevWeightInProfile } from '$lib/store';
	import { db } from '$lib/db';
	import type { ExerciseLog, SetLog, Exercise, Settings, IncrementProfile } from '$lib/types';

	let exerciseLog = $state<ExerciseLog | undefined>();
	let exercise = $state<Exercise | undefined>();
	let sets = $state<SetLog[]>([]);
	let currentSetIndex = $state(0);
	let loading = $state(true);
	let settings = $state<Settings>(getSettings());
	let profile = $state<IncrementProfile | undefined>();

	// Rest timer
	let restActive = $state(false);
	let restRemaining = $state(0);
	let restTimer: ReturnType<typeof setInterval>;

	// Input state for current set
	let inputWeight = $state(0);
	let inputReps = $state<number | undefined>();

	const sessionId = $derived($page.params.id);
	const logId = $derived($page.params.logId);

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

	onDestroy(() => {
		clearInterval(restTimer);
	});

	async function loadData() {
		loading = true;
		exerciseLog = await db.exerciseLogs.get(logId);
		if (!exerciseLog) { goto(`/workout/${sessionId}`); return; }

		exercise = await getExercise(exerciseLog.exerciseId);
		if (exercise?.incrementProfileId) {
			profile = await getIncrementProfile(exercise.incrementProfileId);
		}
		sets = await getSetLogs(logId);

		// Find first incomplete set
		const firstIncomplete = sets.findIndex(s => !s.completed);
		currentSetIndex = firstIncomplete >= 0 ? firstIncomplete : sets.length - 1;

		loading = false;
	}

	async function completeSet() {
		if (inputReps === undefined || inputReps < 0) return;

		const set = sets[currentSetIndex];
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

		// Move to next set or finish
		if (currentSetIndex < sets.length - 1) {
			currentSetIndex++;
			// Rest timer is manual-start, show the button but don't auto-start
		}
	}

	function startRestTimer() {
		restActive = true;
		// Use exercise-specific rest or default
		restRemaining = settings.defaultRestSeconds;
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

	async function finishExercise() {
		if (!exerciseLog) return;
		await finishExerciseLog(exerciseLog.id);
		goto(`/workout/${sessionId}`);
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${String(s).padStart(2, '0')}`;
	}

	const completedCount = $derived(sets.filter(s => s.completed).length);
	const currentSet = $derived(sets[currentSetIndex]);
	const allDone = $derived(sets.length > 0 && sets.every(s => s.completed));
</script>

<div class="max-w-lg mx-auto px-4 pt-4">
	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if exercise}
		<!-- Header -->
		<div class="flex items-center justify-between mb-5">
			<div>
				<h1 class="text-xl font-bold">{exercise.name}</h1>
				<span class="text-text-muted text-sm">
					{completedCount}/{sets.length} sets
					{#if exercise.isBodyweight}
						· Bodyweight
					{/if}
				</span>
				{#if exercise.notes}
					<p class="text-text-secondary text-xs mt-1">{exercise.notes}</p>
				{/if}
			</div>
			<button
				onclick={finishExercise}
				class="text-danger text-sm font-medium"
			>
				{allDone ? 'Done' : 'End Early'}
			</button>
		</div>

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
				Start Rest Timer ({settings.defaultRestSeconds}s)
			</button>
		{/if}

		<!-- Completed Sets -->
		{#if completedCount > 0}
			<div class="mb-4 space-y-2">
				{#each sets as set, i}
					{#if set.completed}
						<div class="flex items-center gap-3 p-3 bg-dark-surface rounded-lg opacity-70">
							<span class="text-success font-bold text-sm w-6">✓</span>
							<span class="text-sm flex-1">Set {set.setNumber}</span>
							<span class="text-sm text-text-secondary">
								{set.actualWeight}kg × {set.actualReps} reps
							</span>
						</div>
					{/if}
				{/each}
			</div>
		{/if}

		<!-- Current Set Input -->
		{#if !allDone && currentSet}
			<div class="bg-dark-card rounded-xl p-5 border border-dark-border">
				<h3 class="text-sm text-text-muted mb-4">Set {currentSet.setNumber} of {sets.length}</h3>

				<!-- Weight Input -->
				{#if !exercise.isBodyweight}
					<div class="mb-4">
						<label class="block text-xs text-text-secondary mb-2">Weight (kg)</label>
						<div class="flex items-center gap-3">
							<button
								onclick={() => {
									if (profile) {
										const prev = getPrevWeightInProfile(inputWeight, profile);
										inputWeight = prev ?? 0;
									} else {
										inputWeight = Math.max(0, inputWeight - (exercise!.weightIncrements?.[0] ?? settings.defaultWeightIncrement));
									}
								}}
								class="w-12 h-12 bg-dark-surface rounded-lg text-xl font-bold text-text-secondary hover:text-text-primary transition-colors"
							>−</button>
							<input
								type="number"
								bind:value={inputWeight}
								step="0.5"
								min="0"
								class="flex-1 bg-dark-surface text-center text-2xl font-bold py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
							/>
							<button
								onclick={() => {
									if (profile) {
										const next = getNextWeightInProfile(inputWeight, profile);
										if (next !== undefined) inputWeight = next;
									} else {
										inputWeight += (exercise!.weightIncrements?.[0] ?? settings.defaultWeightIncrement);
									}
								}}
								class="w-12 h-12 bg-dark-surface rounded-lg text-xl font-bold text-text-secondary hover:text-text-primary transition-colors"
							>+</button>
						</div>
						{#if currentSet.targetWeight > 0}
							<p class="text-xs text-text-muted text-center mt-1">Target: {currentSet.targetWeight}kg</p>
						{/if}
					</div>
				{/if}

				<!-- Reps Input -->
				<div class="mb-5">
					<label class="block text-xs text-text-secondary mb-2">Reps</label>
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
							class="flex-1 bg-dark-surface text-center text-2xl font-bold py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none placeholder:text-text-muted"
						/>
						<button
							onclick={() => inputReps = (inputReps ?? 0) + 1}
							class="w-12 h-12 bg-dark-surface rounded-lg text-xl font-bold text-text-secondary hover:text-text-primary transition-colors"
						>+</button>
					</div>
					<p class="text-xs text-text-muted text-center mt-1">Target: {currentSet.targetReps} reps</p>
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
							<span>Set {set.setNumber}: {set.targetWeight}kg × {set.targetReps} reps</span>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	{/if}
</div>
