<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		getSplits, getSplitDays, getExerciseSlots, getActiveSession,
		getTodaysSplitDay, startWorkoutSession, getExercise,
		getAlternatingExerciseId, getSettings, getAllExerciseIdsForSlot
	} from '$lib/store';
	import type { Split, SplitDay, ExerciseSlot, WorkoutSession, Exercise } from '$lib/types';
	import { WEEKDAY_LABELS, type Weekday } from '$lib/types';

	let splits = $state<Split[]>([]);
	let activeSplit = $state<Split | undefined>();
	let todayDay = $state<SplitDay | undefined>();
	let todaySlots = $state<Array<ExerciseSlot & { exercise?: Exercise; suggestedExerciseId?: string }>>([]);
	let activeSession = $state<WorkoutSession | undefined>();
	let loading = $state(true);

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		splits = await getSplits();
		activeSession = await getActiveSession();

		if (activeSession) {
			// Resume active session
			loading = false;
			return;
		}

		if (splits.length > 0) {
			activeSplit = splits[0]; // Use first split as active
			todayDay = await getTodaysSplitDay(activeSplit);

			if (todayDay) {
				const slots = await getExerciseSlots(todayDay.id);
				todaySlots = await Promise.all(slots.map(async (slot) => {
					const exercise = await getExercise(slot.exerciseId);
					let suggestedExerciseId = slot.exerciseId;
					const altIds = getAllExerciseIdsForSlot(slot).slice(1);
					if (slot.type === 'alternating' && altIds.length > 0) {
						suggestedExerciseId = await getAlternatingExerciseId(slot, todayDay!.id);
					}
					return { ...slot, exercise, suggestedExerciseId };
				}));
			}
		}
		loading = false;
	}

	async function handleStartWorkout() {
		if (!todayDay || !activeSplit) return;
		const session = await startWorkoutSession(todayDay.id, activeSplit.id);
		goto(`/workout/${session.id}`);
	}

	function resumeWorkout() {
		if (activeSession) goto(`/workout/${activeSession.id}`);
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-6">
	<h1 class="text-2xl font-bold mb-6">Workout Tracker</h1>

	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if activeSession}
		<div class="bg-dark-card rounded-xl p-5 border border-accent">
			<div class="flex items-center gap-3 mb-3">
				<div class="w-3 h-3 rounded-full bg-success animate-pulse"></div>
				<h2 class="text-lg font-semibold">Workout In Progress</h2>
			</div>
			<p class="text-text-secondary text-sm mb-4">
				Started {new Date(activeSession.startedAt).toLocaleTimeString()}
			</p>
			<button
				onclick={resumeWorkout}
				class="w-full bg-accent hover:bg-accent-hover text-white font-medium py-3 rounded-lg transition-colors"
			>
				Resume Workout
			</button>
		</div>
	{:else if splits.length === 0}
		<div class="text-center py-12">
			<p class="text-text-secondary mb-4">No workout splits configured yet.</p>
			<a
				href="/splits"
				class="inline-block bg-accent hover:bg-accent-hover text-white font-medium px-6 py-3 rounded-lg transition-colors"
			>
				Create Your First Split
			</a>
		</div>
	{:else if todayDay}
		<div class="bg-dark-card rounded-xl p-5 mb-4">
			<div class="flex items-center justify-between mb-1">
				<h2 class="text-lg font-semibold">{todayDay.name}</h2>
				{#if activeSplit?.type === 'weekday' && todayDay.weekday}
					<span class="text-text-muted text-sm">{WEEKDAY_LABELS[todayDay.weekday]}</span>
				{:else}
					<span class="text-text-muted text-sm">Up Next</span>
				{/if}
			</div>
			<p class="text-text-secondary text-sm mb-4">{activeSplit?.name}</p>

			{#if todaySlots.length > 0}
				<div class="space-y-2 mb-5">
					{#each todaySlots as slot}
						<div class="flex items-center gap-3 p-3 bg-dark-surface rounded-lg">
							<div class="flex-1">
								<span class="text-sm font-medium">{slot.exercise?.name ?? 'Unknown'}</span>
								<span class="text-text-muted text-xs ml-2">
									{slot.targetSets} sets
									{#if slot.type === 'alternating'}
										<span class="text-warning">↔ alternating</span>
									{:else if slot.type === 'optional'}
										<span class="text-text-muted">(optional)</span>
									{/if}
								</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-text-muted text-sm mb-5">No exercises configured for this day.</p>
			{/if}

			<button
				onclick={handleStartWorkout}
				class="w-full bg-accent hover:bg-accent-hover text-white font-bold py-3.5 rounded-lg transition-colors text-lg"
			>
				Start Workout
			</button>
		</div>
	{:else}
		<div class="bg-dark-card rounded-xl p-5">
			<h2 class="text-lg font-semibold mb-2">Rest Day</h2>
			<p class="text-text-secondary text-sm">No workout scheduled for today.</p>
		</div>
	{/if}
</div>
