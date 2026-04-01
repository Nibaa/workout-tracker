<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getExerciseLogs, getSetLogs, getWorkoutStreak } from '$lib/store';
	import { db } from '$lib/db';
	import type { WorkoutSession, SplitDay } from '$lib/types';

	let session = $state<WorkoutSession | undefined>();
	let splitDay = $state<SplitDay | undefined>();
	let loading = $state(true);
	let duration = $state('');
	let totalSets = $state(0);
	let totalReps = $state(0);
	let totalVolume = $state(0);
	let exerciseCount = $state(0);
	let streakDays = $state(0);
	let streakWeeks = $state(0);
	let longestStreak = $state(0);
	let totalWorkouts = $state(0);

	const sessionId = $derived($page.params.id);

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		session = await db.workoutSessions.get(sessionId);
		if (!session || session.status !== 'completed') {
			goto('/');
			return;
		}

		splitDay = await db.splitDays.get(session.splitDayId);

		// Calculate duration
		if (session.finishedAt) {
			const diff = new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime();
			const mins = Math.floor(diff / 60000);
			const secs = Math.floor((diff % 60000) / 1000);
			duration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m ${secs}s`;
		}

		// Calculate session stats
		const logs = await getExerciseLogs(session.id);
		exerciseCount = logs.filter(l => l.finishedAt).length;

		for (const log of logs) {
			const sets = await getSetLogs(log.id);
			const completed = sets.filter(s => s.completed && !s.isWarmup);
			totalSets += completed.length;
			totalReps += completed.reduce((sum, s) => sum + (s.actualReps ?? 0), 0);
			totalVolume += completed.reduce((sum, s) => sum + (s.actualWeight ?? 0) * (s.actualReps ?? 0), 0);
		}

		// Get streak data
		const streak = await getWorkoutStreak();
		streakDays = streak.currentStreakDays;
		streakWeeks = streak.currentStreakWeeks;
		longestStreak = streak.longestStreakDays;
		totalWorkouts = streak.totalWorkouts;

		loading = false;
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-8 text-center">
	{#if loading}
		<div class="text-text-secondary py-12">Loading...</div>
	{:else if session}
		<!-- Celebration -->
		<div class="mb-8">
			<div class="text-6xl mb-4">💪</div>
			<h1 class="text-3xl font-bold mb-2">Well Done!</h1>
			{#if splitDay}
				<p class="text-text-secondary">{splitDay.name} completed</p>
			{/if}
		</div>

		<!-- Session Stats -->
		<div class="grid grid-cols-2 gap-3 mb-6">
			<div class="bg-dark-card rounded-xl p-4">
				<p class="text-2xl font-bold text-accent">{duration}</p>
				<p class="text-text-muted text-xs">Duration</p>
			</div>
			<div class="bg-dark-card rounded-xl p-4">
				<p class="text-2xl font-bold text-accent">{exerciseCount}</p>
				<p class="text-text-muted text-xs">Exercises</p>
			</div>
			<div class="bg-dark-card rounded-xl p-4">
				<p class="text-2xl font-bold text-accent">{totalSets}</p>
				<p class="text-text-muted text-xs">Sets</p>
			</div>
			<div class="bg-dark-card rounded-xl p-4">
				<p class="text-2xl font-bold text-accent">{totalReps}</p>
				<p class="text-text-muted text-xs">Total Reps</p>
			</div>
		</div>

		{#if totalVolume > 0}
			<div class="bg-dark-card rounded-xl p-4 mb-6">
				<p class="text-3xl font-bold text-accent">{Math.round(totalVolume).toLocaleString()} kg</p>
				<p class="text-text-muted text-xs">Total Volume</p>
			</div>
		{/if}

		<!-- Streak -->
		<div class="bg-dark-card rounded-xl p-5 mb-6 border border-dark-border">
			<h3 class="text-sm font-semibold text-text-secondary mb-3">Your Streak</h3>
			<div class="flex justify-around">
				<div>
					<p class="text-2xl font-bold">{streakDays}</p>
					<p class="text-text-muted text-xs">Days active</p>
				</div>
				<div>
					<p class="text-2xl font-bold">{streakWeeks}</p>
					<p class="text-text-muted text-xs">Weeks</p>
				</div>
				<div>
					<p class="text-2xl font-bold">{totalWorkouts}</p>
					<p class="text-text-muted text-xs">Total workouts</p>
				</div>
			</div>
			{#if longestStreak > streakDays}
				<p class="text-text-muted text-xs mt-3">Longest streak: {longestStreak} days</p>
			{:else if streakDays > 0}
				<p class="text-success text-xs mt-3 font-medium">🔥 This is your longest streak!</p>
			{/if}
		</div>

		<!-- Navigation -->
		<a
			href="/"
			class="block w-full bg-accent hover:bg-accent-hover text-white font-medium py-3 rounded-lg transition-colors mb-3"
		>
			Back to Home
		</a>
		<a
			href="/calendar"
			class="block w-full bg-dark-card hover:bg-dark-surface text-text-secondary font-medium py-3 rounded-lg transition-colors"
		>
			View Calendar
		</a>
	{/if}
</div>
