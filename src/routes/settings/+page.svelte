<script lang="ts">
	import { onMount } from 'svelte';
	import { getSettings, saveSettings, exportAllData, importAllData, getIncrementProfiles, createIncrementProfile, updateIncrementProfile, deleteIncrementProfile } from '$lib/store';
	import type { Settings, IncrementProfile } from '$lib/types';

	let settings = $state<Settings>(getSettings());
	let exportData = $state('');
	let importText = $state('');
	let importStatus = $state<'idle' | 'success' | 'error'>('idle');
	let importMsg = $state('');

	// Increment profiles
	let profiles = $state<IncrementProfile[]>([]);
	let showCreateProfile = $state(false);
	let newProfileName = $state('');
	let newProfileWeights = $state('');
	let editingProfileId = $state<string | null>(null);
	let editProfileName = $state('');
	let editProfileWeights = $state('');

	onMount(async () => {
		settings = getSettings();
		profiles = await getIncrementProfiles();
	});

	function save() {
		saveSettings(settings);
	}

	async function handleExport() {
		exportData = await exportAllData();
		const blob = new Blob([exportData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `workout-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImport() {
		if (!importText.trim()) return;
		try {
			await importAllData(importText);
			importStatus = 'success';
			importMsg = 'Data imported successfully! Reload the app to see changes.';
			importText = '';
		} catch (e: any) {
			importStatus = 'error';
			importMsg = e.message ?? 'Import failed';
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			importText = reader.result as string;
		};
		reader.readAsText(file);
	}

	function parseWeights(str: string): number[] {
		return str.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);
	}

	async function handleCreateProfile() {
		const weights = parseWeights(newProfileWeights);
		if (!newProfileName.trim() || weights.length === 0) return;
		await createIncrementProfile(newProfileName.trim(), weights);
		profiles = await getIncrementProfiles();
		newProfileName = '';
		newProfileWeights = '';
		showCreateProfile = false;
	}

	function startEditProfile(p: IncrementProfile) {
		editingProfileId = p.id;
		editProfileName = p.name;
		editProfileWeights = p.weights.join(', ');
	}

	async function saveEditProfile() {
		if (!editingProfileId) return;
		const weights = parseWeights(editProfileWeights);
		if (!editProfileName.trim() || weights.length === 0) return;
		await updateIncrementProfile(editingProfileId, { name: editProfileName.trim(), weights });
		profiles = await getIncrementProfiles();
		editingProfileId = null;
	}

	async function handleDeleteProfile(id: string) {
		await deleteIncrementProfile(id);
		profiles = await getIncrementProfiles();
	}
</script>

<div class="max-w-lg mx-auto px-4 pt-6">
	<h1 class="text-2xl font-bold mb-6">Settings</h1>

	<!-- Rest Timer -->
	<div class="bg-dark-card rounded-xl p-4 mb-4">
		<h2 class="font-semibold mb-3">Defaults</h2>

		<div class="space-y-4">
			<div>
				<label class="block text-sm text-text-secondary mb-1">Rest timer (seconds)</label>
				<input
					type="number"
					bind:value={settings.defaultRestSeconds}
					onchange={save}
					min="0"
					step="5"
					class="w-full bg-dark-surface px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
				/>
			</div>

			<div>
				<label class="block text-sm text-text-secondary mb-1">Rep target for weight increase</label>
				<input
					type="number"
					bind:value={settings.defaultRepTarget}
					onchange={save}
					min="1"
					class="w-full bg-dark-surface px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
				/>
				<p class="text-xs text-text-muted mt-1">When all sets hit this many reps, the app suggests increasing weight.</p>
			</div>

			<div>
				<label class="block text-sm text-text-secondary mb-1">Default weight increment (kg)</label>
				<input
					type="number"
					bind:value={settings.defaultWeightIncrement}
					onchange={save}
					min="0.5"
					step="0.5"
					class="w-full bg-dark-surface px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none"
				/>
			</div>
		</div>
	</div>

	<!-- Increment Profiles -->
	<div class="bg-dark-card rounded-xl p-4 mb-4">
		<div class="flex items-center justify-between mb-3">
			<h2 class="font-semibold">Weight Profiles</h2>
			<button
				onclick={() => showCreateProfile = !showCreateProfile}
				class="text-accent text-sm font-medium"
			>
				{showCreateProfile ? 'Cancel' : '+ New'}
			</button>
		</div>
		<p class="text-xs text-text-muted mb-3">Define available weights for your equipment (e.g., dumbbell sets). Assign a profile to exercises so +/- buttons snap to your actual weights.</p>

		{#if showCreateProfile}
			<div class="bg-dark-surface rounded-lg p-3 mb-3 space-y-2 border border-accent">
				<input
					type="text"
					bind:value={newProfileName}
					placeholder="Profile name (e.g. My Dumbbells)"
					class="w-full bg-dark-bg px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none text-sm"
				/>
				<input
					type="text"
					bind:value={newProfileWeights}
					placeholder="Available weights: 5, 7.5, 10, 12.5, 15, 20, 25, 30"
					class="w-full bg-dark-bg px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none text-sm"
				/>
				<p class="text-xs text-text-muted">Comma-separated list of available weights in kg</p>
				<button
					onclick={handleCreateProfile}
					disabled={!newProfileName.trim() || !newProfileWeights.trim()}
					class="w-full bg-success hover:bg-green-600 disabled:bg-dark-surface disabled:text-text-muted text-white py-2 rounded-lg text-sm font-medium transition-colors"
				>
					Create Profile
				</button>
			</div>
		{/if}

		{#if profiles.length === 0}
			<p class="text-text-secondary text-sm text-center py-4">No profiles yet. Create one to get started.</p>
		{:else}
			<div class="space-y-2">
				{#each profiles as p}
					{#if editingProfileId === p.id}
						<div class="bg-dark-surface rounded-lg p-3 space-y-2 border border-accent">
							<input
								type="text"
								bind:value={editProfileName}
								class="w-full bg-dark-bg px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none text-sm"
							/>
							<input
								type="text"
								bind:value={editProfileWeights}
								class="w-full bg-dark-bg px-3 py-2 rounded-lg border border-dark-border focus:border-accent focus:outline-none text-sm"
							/>
							<div class="flex gap-2">
								<button onclick={saveEditProfile} class="flex-1 bg-success text-white py-1.5 rounded-lg text-sm">Save</button>
								<button onclick={() => editingProfileId = null} class="flex-1 bg-dark-bg text-text-secondary py-1.5 rounded-lg text-sm">Cancel</button>
							</div>
						</div>
					{:else}
						<div class="bg-dark-surface rounded-lg p-3">
							<div class="flex items-center justify-between mb-1">
								<span class="font-medium text-sm">{p.name}</span>
								<div class="flex gap-2">
									<button onclick={() => startEditProfile(p)} class="text-accent text-xs">Edit</button>
									<button onclick={() => handleDeleteProfile(p.id)} class="text-danger text-xs">Delete</button>
								</div>
							</div>
							<p class="text-xs text-text-muted">{p.weights.join(', ')} kg</p>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Data Management -->
	<div class="bg-dark-card rounded-xl p-4 mb-4">
		<h2 class="font-semibold mb-3">Data Management</h2>

		<button
			onclick={handleExport}
			class="w-full bg-accent hover:bg-accent-hover text-white py-2 rounded-lg font-medium transition-colors mb-3"
		>
			Export All Data (JSON)
		</button>

		<div class="border-t border-dark-border pt-3">
			<p class="text-sm text-text-secondary mb-2">Import backup</p>
			<input
				type="file"
				accept=".json"
				onchange={handleFileSelect}
				class="w-full text-sm text-text-secondary mb-2 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-dark-surface file:text-text-primary file:cursor-pointer"
			/>
			{#if importText}
				<button
					onclick={handleImport}
					class="w-full bg-warning hover:bg-amber-600 text-white py-2 rounded-lg font-medium transition-colors"
				>
					Import (replaces all data!)
				</button>
			{/if}
			{#if importStatus !== 'idle'}
				<p class="text-sm mt-2 {importStatus === 'success' ? 'text-success' : 'text-danger'}">{importMsg}</p>
			{/if}
		</div>
	</div>

	<!-- About -->
	<div class="bg-dark-card rounded-xl p-4">
		<h2 class="font-semibold mb-2">About</h2>
		<p class="text-text-secondary text-sm">
			Workout Tracker PWA — All data stored locally on your device.
		</p>
		<p class="text-text-muted text-xs mt-1">
			Use Export to back up your data regularly.
		</p>
	</div>
</div>
