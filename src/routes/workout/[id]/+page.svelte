<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		getExerciseSlots, getExerciseLogs, getExercise, getSetLogs,
		finishWorkoutSession, createExerciseLog, getAlternatingExerciseId,
		getLastPerformance, calculateProgression, createSetLog, getSettings,
		getAllExerciseIdsForSlot, getIncrementProfile
	} from '$lib/store';
	import { db } from '$lib/db';
	import type { WorkoutSession, SplitDay, ExerciseSlot, ExerciseLog, SetLog, Exercise, Settings, IncrementProfile } from '$lib/types';

	let session = $state<WorkoutSession | undefined>();
	let splitDay = $state<SplitDay | undefined>();
	let slots = $state<Array<ExerciseSlot & {
		exercise?: Exercise;
		alternateExercises?: Exercise[];
		suggestedExerciseId?: string;
		log?: ExerciseLog;
		sets?: SetLog[];
		done?: boolean;
	}>>([]);
	let loading = $state(true);
	let elapsed = $state('00:00');
	let timer: ReturnType<typeof setInterval>;
	let settings = $state<Settings>(getSettings());

	const sessionId = $derived($page.params.id);

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
		session = await db.workoutSessions.get(sessionId);
		if (!session) { goto('/'); return; }

		splitDay = await db.splitDays.get(session.splitDayId);
		if (!splitDay) { goto('/'); return; }

		const rawSlots = await getExerciseSlots(splitDay.id);
		const existingLogs = await getExerciseLogs(session.id);

		slots = await Promise.all(rawSlots.map(async (slot) => {
			const exercise = await getExercise(slot.exerciseId);
			const altIds = getAllExerciseIdsForSlot(slot).slice(1);
			const alternateExercises = (await Promise.all(altIds.map(id => getExercise(id)))).filter((e): e is Exercise => !!e);
			let suggestedExerciseId = slot.exerciseId;

			if (slot.type === 'alternating' && altIds.length > 0) {
				suggestedExerciseId = await getAlternatingExerciseId(slot, splitDay!.id);
			}

			const log = existingLogs.find(l => l.slotId === slot.id);
			let sets: SetLog[] = [];
			let done = false;

			if (log) {
				sets = await getSetLogs(log.id);
				done = log.finishedAt != null;
			}

			return { ...slot, exercise, alternateExercises, suggestedExerciseId, log, sets, done };
		}));

		loading = false;
	}

	async function startExercise(slot: typeof slots[0], exerciseId?: string) {
		if (!session) return;
		const eid = exerciseId ?? slot.suggestedExerciseId ?? slot.exerciseId;
		const nextOrder = slots.filter(s => s.log).length;

		const log = await createExerciseLog({
			sessionId: session.id,
			exerciseId: eid,
			slotId: slot.id,
			order: nextOrder
		});

		// Create target sets based on progression
		const last = await getLastPerformance(eid, session.splitDayId);
		const exercise = await getExercise(eid);
		// Rep target resolution: slot → exercise → split day → global
		const splitDayRepTarget = splitDay?.defaultRepTarget;
		const slotTargetReps = slot.targetReps ?? exercise?.repTarget ?? splitDayRepTarget ?? settings.defaultRepTarget;
		const repTarget = exercise?.repTarget ?? splitDayRepTarget ?? settings.defaultRepTarget;
		const increment = settings.defaultWeightIncrement;

		// Load increment profile if exercise references one
		let profile: IncrementProfile | undefined;
		if (exercise?.incrementProfileId) {
			profile = await getIncrementProfile(exercise.incrementProfileId);
		}

		for (let i = 0; i < slot.targetSets; i++) {
			let targetWeight = 0;
			let targetReps = slotTargetReps;

			if (last && last.sets[i]) {
				const prog = calculateProgression(
					last.sets.filter(s => s.completed),
					repTarget,
					increment,
					exercise?.weightIncrements,
					profile
				);
				targetWeight = prog.suggestedWeight;
				targetReps = prog.suggestedReps;
			} else if (last) {
				targetWeight = last.weight;
				targetReps = last.reps + 1;
			}

			if (exercise?.isBodyweight) targetWeight = 0;

			await createSetLog({
				exerciseLogId: log.id,
				setNumber: i + 1,
				targetWeight,
				targetReps,
				isWarmup: false,
				completed: false
			});
		}

		goto(`/workout/${session.id}/exercise/${log.id}`);
	}

	async function handleFinishWorkout() {
		if (!session) return;
		await finishWorkoutSession(session.id);
		goto('/');
	}

	function getSlotStatusColor(slot: typeof slots[0]): string {
		if (slot.done) return 'border-success';
		if (slot.log) return 'border-warning';
		return 'border-dark-border';
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
			<button
				onclick={handleFinishWorkout}
				class="bg-danger hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
			>
				Finish
			</button>
		</div>

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
						{#if slot.done}
							<span class="text-success text-sm">✓ Done</span>
						{:else if slot.log}
							<span class="text-warning text-sm">In progress</span>
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

					{#if slot.done}
						<!-- Show completed summary -->
						<div class="space-y-1">
							{#each slot.sets ?? [] as set}
								{#if set.completed}
									<div class="text-xs text-text-secondary">
										Set {set.setNumber}: {set.actualWeight}kg × {set.actualReps} reps
									</div>
								{/if}
							{/each}
						</div>
					{:else if slot.log}
						<!-- Resume -->
						<button
							onclick={() => goto(`/workout/${session!.id}/exercise/${slot.log!.id}`)}
							class="w-full bg-warning/20 text-warning py-2 rounded-lg text-sm font-medium"
						>
							Resume
						</button>
					{:else}
						<!-- Start exercise -->
						<div class="flex gap-2 flex-wrap">
							{#if slot.type === 'alternating' && slot.alternateExercises && slot.alternateExercises.length > 0}
								<button
									onclick={() => startExercise(slot, slot.exerciseId)}
									class="flex-1 bg-accent/20 text-accent py-2 rounded-lg text-sm font-medium
										{slot.suggestedExerciseId === slot.exerciseId ? 'ring-1 ring-accent' : ''}"
								>
									{slot.exercise?.name}
								</button>
								{#each slot.alternateExercises as alt}
									<button
										onclick={() => startExercise(slot, alt.id)}
										class="flex-1 bg-accent/20 text-accent py-2 rounded-lg text-sm font-medium
											{slot.suggestedExerciseId === alt.id ? 'ring-1 ring-accent' : ''}"
									>
										{alt.name}
									</button>
								{/each}
							{:else}
								<button
									onclick={() => startExercise(slot)}
									class="flex-1 bg-accent hover:bg-accent-hover text-white py-2 rounded-lg text-sm font-medium transition-colors"
								>
									Start
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<button
			onclick={handleFinishWorkout}
			class="w-full mt-6 bg-success hover:bg-green-600 text-white font-bold py-3.5 rounded-lg transition-colors"
		>
			Finish Workout
		</button>
	{/if}
</div>
