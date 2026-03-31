<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		getExerciseLogs, getSetLogs, getExercise, updateSetLog,
		deleteSetLog, deleteExerciseLog, updateWorkoutSession,
		deleteWorkoutSession, createSetLog, getSettings
	} from '$lib/store';
	import { db } from '$lib/db';
	import type { WorkoutSession, SplitDay, ExerciseLog, SetLog, Exercise, Settings } from '$lib/types';
	import { v4 as uuidv4 } from 'uuid';

	let session = $state<WorkoutSession | undefined>();
	let splitDay = $state<SplitDay | undefined>();
	let logs = $state<Array<ExerciseLog & { exercise?: Exercise; sets: SetLog[] }>>([]);
	let loading = $state(true);
	let settings = $state<Settings>(getSettings());
	let sessionNotes = $state('');
	let showDeleteConfirm = $state(false);

	const sessionId = $derived($page.params.id);

	onMount(async () => {
		settings = getSettings();
		await loadData();
	});

	async function loadData() {
		loading = true;
		session = await db.workoutSessions.get(sessionId);
		if (!session) { goto('/calendar'); return; }

		splitDay = await db.splitDays.get(session.splitDayId);
		sessionNotes = session.notes ?? '';

		const rawLogs = await getExerciseLogs(session.id);
		logs = await Promise.all(rawLogs.map(async (log) => {
			const exercise = await getExercise(log.exerciseId);
			const sets = await getSetLogs(log.id);
			return { ...log, exercise, sets };
		}));

		loading = false;
	}

	async function handleUpdateSet(logIndex: number, setIndex: number, field: 'actualWeight' | 'actualReps', value: number) {
		const set = logs[logIndex].sets[setIndex];
		await updateSetLog(set.id, { [field]: value });
		logs[logIndex].sets[setIndex] = { ...set, [field]: value };
	}

	async function handleToggleCompleted(logIndex: number, setIndex: number) {
		const set = logs[logIndex].sets[setIndex];
		const newCompleted = !set.completed;
		await updateSetLog(set.id, { completed: newCompleted });
		logs[logIndex].sets[setIndex] = { ...set, completed: newCompleted };
	}

	async function handleDeleteSet(logIndex: number, setIndex: number) {
		const set = logs[logIndex].sets[setIndex];
		await deleteSetLog(set.id);
		logs[logIndex].sets = logs[logIndex].sets.filter((_, i) => i !== setIndex);
		// Renumber remaining sets
		for (let i = 0; i < logs[logIndex].sets.length; i++) {
			if (logs[logIndex].sets[i].setNumber !== i + 1) {
				await updateSetLog(logs[logIndex].sets[i].id, { setNumber: i + 1 });
				logs[logIndex].sets[i] = { ...logs[logIndex].sets[i], setNumber: i + 1 };
			}
		}
	}

	async function handleAddSet(logIndex: number) {
		const log = logs[logIndex];
		const lastSet = log.sets[log.sets.length - 1];
		const newSet = await createSetLog({
			exerciseLogId: log.id,
			setNumber: log.sets.length + 1,
			targetWeight: lastSet?.targetWeight ?? 0,
			targetReps: lastSet?.targetReps ?? settings.defaultRepTarget,
			actualWeight: lastSet?.actualWeight ?? lastSet?.targetWeight ?? 0,
			actualReps: undefined,
			isWarmup: false,
			completed: false
		});
		logs[logIndex].sets = [...log.sets, newSet];
	}

	async function handleDeleteExerciseLog(logIndex: number) {
		const log = logs[logIndex];
		await deleteExerciseLog(log.id);
		logs = logs.filter((_, i) => i !== logIndex);
	}

	async function handleSaveNotes() {
		if (!session) return;
		await updateWorkoutSession(session.id, { notes: sessionNotes || undefined });
	}

	async function handleDeleteSession() {
		if (!session) return;
		await deleteWorkoutSession(session.id);
		goto('/calendar');
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
		});
	}

	function formatTime(isoStr: string): string {
		return new Date(isoStr).toLocaleTimeString('en-US', {
			hour: '2-digit', minute: '2-digit'
		});
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-4 pb-20">
	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else if session}
		<!-- Header -->
		<div class="flex items-center justify-between mb-5">
			<div>
				<h1 class="text-xl font-bold">Edit Workout</h1>
				<p class="text-text-muted text-sm">
					{splitDay?.name ?? 'Workout'} · {formatDate(session.date)}
				</p>
				<p class="text-text-muted text-xs">
					{formatTime(session.startedAt)}
					{#if session.finishedAt}
						– {formatTime(session.finishedAt)}
					{/if}
				</p>
			</div>
			<a href="/calendar" class="text-text-secondary text-sm">← Back</a>
		</div>

		<!-- Session Notes -->
		<div class="bg-dark-card rounded-xl p-4 mb-4 border border-dark-border">
			<label class="block text-xs text-text-secondary mb-2">Session Notes</label>
			<textarea
				bind:value={sessionNotes}
				onblur={handleSaveNotes}
				placeholder="Add notes about this workout..."
				rows="2"
				class="w-full bg-dark-surface text-sm rounded-lg border border-dark-border p-2 focus:border-accent focus:outline-none resize-none"
			></textarea>
		</div>

		<!-- Exercise Logs -->
		{#each logs as log, logIndex}
			<div class="bg-dark-card rounded-xl p-4 mb-3 border border-dark-border">
				<div class="flex items-center justify-between mb-3">
					<h3 class="font-semibold">{log.exercise?.name ?? 'Unknown Exercise'}</h3>
					<button
						onclick={() => handleDeleteExerciseLog(logIndex)}
						class="text-danger text-xs font-medium"
					>
						Remove
					</button>
				</div>

				<!-- Sets -->
				<div class="space-y-2">
					{#each log.sets as set, setIndex}
						<div class="flex items-center gap-2 p-2 bg-dark-surface rounded-lg">
							<button
								onclick={() => handleToggleCompleted(logIndex, setIndex)}
								class="w-6 h-6 rounded flex items-center justify-center text-xs font-bold
									{set.completed ? 'bg-success text-white' : 'bg-dark-border text-text-muted'}"
							>
								{set.completed ? '✓' : set.setNumber}
							</button>

							<div class="flex-1 flex items-center gap-2">
								<div class="flex-1">
									<label class="text-[10px] text-text-muted block">kg</label>
									<input
										type="number"
										value={set.actualWeight ?? set.targetWeight}
										onchange={(e) => handleUpdateSet(logIndex, setIndex, 'actualWeight', Number(e.currentTarget.value))}
										step="0.5"
										min="0"
										class="w-full bg-dark-card text-sm text-center py-1 rounded border border-dark-border focus:border-accent focus:outline-none"
									/>
								</div>
								<span class="text-text-muted text-xs mt-3">×</span>
								<div class="flex-1">
									<label class="text-[10px] text-text-muted block">reps</label>
									<input
										type="number"
										value={set.actualReps}
										onchange={(e) => handleUpdateSet(logIndex, setIndex, 'actualReps', Number(e.currentTarget.value))}
										placeholder="–"
										min="0"
										class="w-full bg-dark-card text-sm text-center py-1 rounded border border-dark-border focus:border-accent focus:outline-none"
									/>
								</div>
							</div>

							<button
								onclick={() => handleDeleteSet(logIndex, setIndex)}
								class="text-text-muted hover:text-danger text-xs p-1"
							>
								✕
							</button>
						</div>
					{/each}
				</div>

				<button
					onclick={() => handleAddSet(logIndex)}
					class="w-full mt-2 text-accent text-xs font-medium py-1.5"
				>
					+ Add Set
				</button>
			</div>
		{/each}

		{#if logs.length === 0}
			<div class="text-text-muted text-center py-8 text-sm">
				No exercises logged in this session.
			</div>
		{/if}

		<!-- Delete Session -->
		<div class="mt-6 pt-4 border-t border-dark-border">
			{#if showDeleteConfirm}
				<div class="bg-danger/10 rounded-xl p-4 border border-danger">
					<p class="text-sm text-danger font-medium mb-3">Delete this entire workout session? This cannot be undone.</p>
					<div class="flex gap-2">
						<button
							onclick={handleDeleteSession}
							class="flex-1 bg-danger text-white py-2 rounded-lg text-sm font-medium"
						>
							Delete
						</button>
						<button
							onclick={() => showDeleteConfirm = false}
							class="flex-1 bg-dark-surface text-text-secondary py-2 rounded-lg text-sm font-medium"
						>
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<button
					onclick={() => showDeleteConfirm = true}
					class="w-full text-danger text-sm font-medium py-2"
				>
					Delete Workout Session
				</button>
			{/if}
		</div>
	{/if}
</div>
