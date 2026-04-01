<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllSessions, getSplitDays, getSplit, deleteWorkoutSession, getBreaksInRange, createWorkoutBreak, deleteWorkoutBreak } from '$lib/store';
	import { db } from '$lib/db';
	import type { WorkoutSession, SplitDay, Split, WorkoutBreak, BreakReason } from '$lib/types';
	import { BREAK_REASON_LABELS } from '$lib/types';

	let sessions = $state<Array<WorkoutSession & { splitDay?: SplitDay; split?: Split }>>([]);
	let breaks = $state<WorkoutBreak[]>([]);
	let loading = $state(true);
	let currentMonth = $state(new Date());

	// Break form
	let showBreakForm = $state(false);
	let breakStartDate = $state('');
	let breakEndDate = $state('');
	let breakReason = $state<BreakReason>('vacation');
	let breakCustomReason = $state('');

	onMount(async () => {
		await loadSessions();
	});

	async function loadSessions() {
		loading = true;
		const raw = await getAllSessions();
		sessions = await Promise.all(raw.map(async (s) => {
			const splitDay = await db.splitDays.get(s.splitDayId);
			const split = await db.splits.get(s.splitId);
			return { ...s, splitDay, split };
		}));
		breaks = await getBreaksInRange('2000-01-01', '2099-12-31');
		loading = false;
	}

	function prevMonth() {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
	}

	function nextMonth() {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
	}

	const monthLabel = $derived(
		currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
	);

	const calendarDays = $derived(() => {
		const year = currentMonth.getFullYear();
		const month = currentMonth.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const startPad = (firstDay.getDay() + 6) % 7; // Monday start

		const days: Array<{ date: number | null; dateStr: string; sessions: typeof sessions; breakInfo?: WorkoutBreak }> = [];

		// Padding
		for (let i = 0; i < startPad; i++) {
			days.push({ date: null, dateStr: '', sessions: [] });
		}

		// Actual days
		for (let d = 1; d <= lastDay.getDate(); d++) {
			const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const daySessions = sessions.filter(s => s.date === dateStr);
			const breakInfo = breaks.find(b => dateStr >= b.startDate && dateStr <= b.endDate);
			days.push({ date: d, dateStr, sessions: daySessions, breakInfo });
		}

		return days;
	});

	const monthSessions = $derived(
		sessions.filter(s => {
			const d = new Date(s.date);
			return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
		})
	);

	let selectedDate = $state<string | null>(null);
	const selectedSessions = $derived(
		selectedDate ? sessions.filter(s => s.date === selectedDate) : []
	);
	const selectedBreak = $derived(
		selectedDate ? breaks.find(b => selectedDate! >= b.startDate && selectedDate! <= b.endDate) : undefined
	);

	let deleteConfirmId = $state<string | null>(null);

	async function handleDeleteSession(id: string) {
		await deleteWorkoutSession(id);
		sessions = sessions.filter(s => s.id !== id);
		deleteConfirmId = null;
		if (selectedSessions.length === 0) selectedDate = null;
	}

	async function handleAddBreak() {
		if (!breakStartDate || !breakEndDate) return;
		await createWorkoutBreak({
			startDate: breakStartDate,
			endDate: breakEndDate,
			reason: breakReason,
			customReason: breakReason === 'other' ? breakCustomReason.trim() || undefined : undefined
		});
		showBreakForm = false;
		breakStartDate = '';
		breakEndDate = '';
		breakReason = 'vacation';
		breakCustomReason = '';
		await loadSessions();
	}

	async function handleDeleteBreak(id: string) {
		await deleteWorkoutBreak(id);
		breaks = breaks.filter(b => b.id !== id);
	}

	function formatBreakReason(b: WorkoutBreak): string {
		if (b.reason === 'other' && b.customReason) return b.customReason;
		return BREAK_REASON_LABELS[b.reason];
	}

	function formatDuration(session: WorkoutSession): string {
		if (!session.finishedAt) return 'In progress';
		const diff = new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime();
		const mins = Math.round(diff / 60000);
		return `${mins}min`;
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-6">
	<h1 class="text-2xl font-bold mb-4">Calendar</h1>

	{#if loading}
		<div class="text-text-secondary text-center py-12">Loading...</div>
	{:else}
		<!-- Month Navigation -->
		<div class="flex items-center justify-between mb-4">
			<button onclick={prevMonth} class="text-text-secondary hover:text-text-primary px-3 py-1 text-xl">←</button>
			<span class="font-semibold">{monthLabel}</span>
			<button onclick={nextMonth} class="text-text-secondary hover:text-text-primary px-3 py-1 text-xl">→</button>
		</div>

		<!-- Month Stats -->
		<div class="flex gap-3 mb-4">
			<div class="flex-1 bg-dark-card rounded-lg p-3 text-center">
				<p class="text-2xl font-bold">{monthSessions.length}</p>
				<p class="text-text-muted text-xs">Workouts</p>
			</div>
		</div>

		<!-- Day Headers -->
		<div class="grid grid-cols-7 gap-1 mb-1">
			{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day}
				<div class="text-center text-text-muted text-xs py-1">{day}</div>
			{/each}
		</div>

		<!-- Calendar Grid -->
		<div class="grid grid-cols-7 gap-1 mb-4">
			{#each calendarDays() as day}
				{#if day.date === null}
					<div></div>
				{:else}
					<button
						onclick={() => selectedDate = (day.sessions.length > 0 || day.breakInfo) ? day.dateStr : null}
						class="aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors relative
							{day.dateStr === new Date().toISOString().split('T')[0] ? 'ring-1 ring-accent' : ''}
							{selectedDate === day.dateStr ? 'bg-accent text-white' : day.sessions.length > 0 ? 'bg-dark-card hover:bg-dark-surface' : day.breakInfo ? 'bg-warning/10 hover:bg-warning/20' : 'text-text-secondary hover:bg-dark-surface/50'}"
					>
						{day.date}
						{#if day.sessions.length > 0}
							<div class="absolute bottom-1 flex gap-0.5">
								{#each day.sessions as _}
									<div class="w-1 h-1 rounded-full bg-success"></div>
								{/each}
							</div>
						{:else if day.breakInfo}
							<div class="absolute bottom-1">
								<div class="w-1 h-1 rounded-full bg-warning"></div>
							</div>
						{/if}
					</button>
				{/if}
			{/each}
		</div>

		<!-- Selected Date Details -->
		{#if selectedDate && (selectedSessions.length > 0 || selectedBreak)}
			<div class="bg-dark-card rounded-xl p-4 border border-dark-border mb-4">
				<h3 class="font-semibold mb-3">{selectedDate}</h3>

				{#if selectedBreak}
					<div class="p-3 bg-warning/10 rounded-lg mb-2 border border-warning/30">
						<div class="flex items-center justify-between">
							<span class="text-warning text-sm font-medium">Break: {formatBreakReason(selectedBreak)}</span>
							<button onclick={() => handleDeleteBreak(selectedBreak!.id)} class="text-danger text-xs">Delete</button>
						</div>
						<p class="text-text-muted text-xs mt-1">{selectedBreak.startDate} → {selectedBreak.endDate}</p>
					</div>
				{/if}

				<div class="space-y-2">
					{#each selectedSessions as session}
						<div class="p-3 bg-dark-surface rounded-lg">
							<div class="flex items-center justify-between">
								<span class="font-medium text-sm">{session.splitDay?.name ?? 'Workout'}</span>
								<span class="text-text-muted text-xs">{formatDuration(session)}</span>
							</div>
							{#if session.split}
								<p class="text-text-muted text-xs">{session.split.name}</p>
							{/if}
							{#if session.notes}
								<p class="text-text-secondary text-xs mt-1">{session.notes}</p>
							{/if}
							<div class="flex gap-2 mt-2">
								<a
									href="/workout/{session.id}/edit"
									class="text-accent text-xs font-medium"
								>
									Edit
								</a>
								{#if deleteConfirmId === session.id}
									<button
										onclick={() => handleDeleteSession(session.id)}
										class="text-danger text-xs font-medium"
									>
										Confirm Delete
									</button>
									<button
										onclick={() => deleteConfirmId = null}
										class="text-text-muted text-xs"
									>
										Cancel
									</button>
								{:else}
									<button
										onclick={() => deleteConfirmId = session.id}
										class="text-danger text-xs font-medium"
									>
										Delete
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Add Break Button -->
		<button
			onclick={() => {
				showBreakForm = !showBreakForm;
				if (selectedDate) { breakStartDate = selectedDate; breakEndDate = selectedDate; }
			}}
			class="w-full bg-dark-card hover:bg-dark-surface text-text-secondary py-3 rounded-xl border border-dark-border transition-colors text-sm font-medium mb-4"
		>
			{showBreakForm ? 'Cancel' : '+ Log a Break'}
		</button>

		{#if showBreakForm}
			<div class="bg-dark-card rounded-xl p-4 border border-warning/30 mb-4 space-y-3">
				<h3 class="text-sm font-semibold text-warning">Log Break</h3>
				<div class="flex gap-2">
					<div class="flex-1">
						<label class="text-xs text-text-muted">Start</label>
						<input type="date" bind:value={breakStartDate}
							class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm" />
					</div>
					<div class="flex-1">
						<label class="text-xs text-text-muted">End</label>
						<input type="date" bind:value={breakEndDate}
							class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm" />
					</div>
				</div>
				<div>
					<label class="text-xs text-text-muted">Reason</label>
					<select bind:value={breakReason}
						class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm">
						<option value="vacation">Vacation</option>
						<option value="illness">Illness</option>
						<option value="injury">Injury</option>
						<option value="other">Other</option>
					</select>
				</div>
				{#if breakReason === 'other'}
					<input type="text" bind:value={breakCustomReason} placeholder="Reason..."
						class="w-full bg-dark-surface text-text-primary px-3 py-2 rounded-lg border border-dark-border text-sm" />
				{/if}
				<button
					onclick={handleAddBreak}
					disabled={!breakStartDate || !breakEndDate}
					class="w-full bg-warning text-dark-bg py-2 rounded-lg text-sm font-medium disabled:opacity-50"
				>
					Save Break
				</button>
			</div>
		{/if}

		<!-- Breaks List -->
		{#if breaks.length > 0}
			<div class="bg-dark-card rounded-xl p-4 border border-dark-border">
				<h3 class="text-sm font-semibold text-text-secondary mb-2">Logged Breaks</h3>
				<div class="space-y-2">
					{#each breaks as brk}
						<div class="flex items-center justify-between p-2 bg-dark-surface rounded-lg text-xs">
							<div>
								<span class="text-warning font-medium">{formatBreakReason(brk)}</span>
								<span class="text-text-muted ml-2">{brk.startDate} → {brk.endDate}</span>
							</div>
							<button onclick={() => handleDeleteBreak(brk.id)} class="text-danger">×</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
