<script lang="ts">
	import { onMount } from 'svelte';
	import { getExercises, getMuscleGroups, getExerciseHistory } from '$lib/store';
	import type { Exercise, MuscleGroup } from '$lib/types';

	let exercises = $state<Exercise[]>([]);
	let muscleGroups = $state<MuscleGroup[]>([]);
	let selectedExerciseId = $state('');
	let selectedGroupId = $state('');
	let loading = $state(false);

	let historyData = $state<Array<{
		date: string; weight: number; totalVolume: number;
		totalReps: number; totalSets: number; estimated1RM: number;
	}>>([]);

	let canvas = $state<HTMLCanvasElement>();
	let chartInstance: any = null;

	onMount(async () => {
		exercises = await getExercises();
		muscleGroups = await getMuscleGroups();
	});

	const filteredExercises = $derived(
		selectedGroupId
			? exercises.filter(e => e.muscleGroupId === selectedGroupId || e.secondaryMuscleGroupIds?.includes(selectedGroupId))
			: exercises
	);

	async function loadHistory() {
		if (!selectedExerciseId) {
			historyData = [];
			return;
		}
		loading = true;
		historyData = await getExerciseHistory(selectedExerciseId);
		loading = false;

		await renderChart();
	}

	async function renderChart() {
		if (!canvas || historyData.length === 0) return;

		const { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } = await import('chart.js');
		Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

		if (chartInstance) chartInstance.destroy();

		const labels = historyData.map(d => d.date);
		chartInstance = new Chart(canvas, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label: 'Max Weight (kg)',
						data: historyData.map(d => d.weight),
						borderColor: '#6366f1',
						backgroundColor: '#6366f133',
						tension: 0.3
					},
					{
						label: 'Est. 1RM (kg)',
						data: historyData.map(d => d.estimated1RM),
						borderColor: '#22c55e',
						backgroundColor: '#22c55e33',
						tension: 0.3
					},
					{
						label: 'Volume (kg×reps)',
						data: historyData.map(d => d.totalVolume),
						borderColor: '#f59e0b',
						backgroundColor: '#f59e0b33',
						tension: 0.3,
						yAxisID: 'y1'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { labels: { color: '#a3a3a3', font: { size: 11 } } }
				},
				scales: {
					x: {
						ticks: { color: '#737373', maxTicksLimit: 8 },
						grid: { color: '#333333' }
					},
					y: {
						position: 'left',
						ticks: { color: '#737373' },
						grid: { color: '#333333' }
					},
					y1: {
						position: 'right',
						ticks: { color: '#737373' },
						grid: { display: false }
					}
				}
			}
		});
	}

	function getGroupName(id: string): string {
		return muscleGroups.find(g => g.id === id)?.name ?? 'Unknown';
	}

	const selectedExercise = $derived(exercises.find(e => e.id === selectedExerciseId));

	const latestStats = $derived(historyData.length > 0 ? historyData[historyData.length - 1] : null);
	const bestWeight = $derived(historyData.length > 0 ? Math.max(...historyData.map(d => d.weight)) : 0);
	const best1RM = $derived(historyData.length > 0 ? Math.max(...historyData.map(d => d.estimated1RM)) : 0);
	const bestVolume = $derived(historyData.length > 0 ? Math.max(...historyData.map(d => d.totalVolume)) : 0);
</script>

<div class="max-w-lg mx-auto px-4 pt-6">
	<h1 class="text-2xl font-bold mb-4">Progress</h1>

	<!-- Filters -->
	<div class="flex gap-2 mb-4">
		<select
			bind:value={selectedGroupId}
			onchange={() => { selectedExerciseId = ''; historyData = []; }}
			class="flex-1 bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm"
		>
			<option value="">All muscle groups</option>
			{#each muscleGroups as group}
				<option value={group.id}>{group.name}</option>
			{/each}
		</select>
	</div>

	<select
		bind:value={selectedExerciseId}
		onchange={loadHistory}
		class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm mb-4"
	>
		<option value="">Select exercise...</option>
		{#each filteredExercises as ex}
			<option value={ex.id}>{ex.name} ({getGroupName(ex.muscleGroupId)})</option>
		{/each}
	</select>

	{#if loading}
		<div class="text-text-secondary text-center py-8">Loading...</div>
	{:else if selectedExerciseId && historyData.length === 0}
		<div class="text-text-muted text-center py-8">No data yet for this exercise.</div>
	{:else if historyData.length > 0}
		<!-- Stats Cards -->
		<div class="grid grid-cols-2 gap-3 mb-4">
			<div class="bg-dark-card rounded-xl p-3">
				<p class="text-text-muted text-xs">Best Weight</p>
				<p class="text-xl font-bold">{bestWeight}<span class="text-sm font-normal text-text-muted"> kg</span></p>
			</div>
			<div class="bg-dark-card rounded-xl p-3">
				<p class="text-text-muted text-xs">Est. 1RM PR</p>
				<p class="text-xl font-bold text-success">{best1RM}<span class="text-sm font-normal text-text-muted"> kg</span></p>
			</div>
			<div class="bg-dark-card rounded-xl p-3">
				<p class="text-text-muted text-xs">Best Volume</p>
				<p class="text-xl font-bold text-warning">{bestVolume}</p>
			</div>
			<div class="bg-dark-card rounded-xl p-3">
				<p class="text-text-muted text-xs">Sessions</p>
				<p class="text-xl font-bold">{historyData.length}</p>
			</div>
		</div>

		<!-- Chart -->
		<div class="bg-dark-card rounded-xl p-4 mb-4" style="height: 300px;">
			<canvas bind:this={canvas}></canvas>
		</div>

		<!-- History Table -->
		<div class="bg-dark-card rounded-xl overflow-hidden">
			<table class="w-full text-sm">
				<thead>
					<tr class="text-text-muted text-xs border-b border-dark-border">
						<th class="text-left p-3">Date</th>
						<th class="text-right p-3">Weight</th>
						<th class="text-right p-3">Sets×Reps</th>
						<th class="text-right p-3">Volume</th>
					</tr>
				</thead>
				<tbody>
					{#each [...historyData].reverse() as entry}
						<tr class="border-b border-dark-border/50">
							<td class="p-3 text-text-secondary">{entry.date}</td>
							<td class="p-3 text-right">{entry.weight}kg</td>
							<td class="p-3 text-right text-text-secondary">{entry.totalSets}×{Math.round(entry.totalReps / entry.totalSets)}</td>
							<td class="p-3 text-right text-text-muted">{entry.totalVolume}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="text-center py-12">
			<p class="text-text-secondary">Select an exercise to view progress.</p>
		</div>
	{/if}
</div>
