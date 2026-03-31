<script lang="ts">
	import { onMount } from 'svelte';
	import { getSettings, saveSettings, exportAllData, importAllData } from '$lib/store';
	import type { Settings } from '$lib/types';

	let settings = $state<Settings>(getSettings());
	let exportData = $state('');
	let importText = $state('');
	let importStatus = $state<'idle' | 'success' | 'error'>('idle');
	let importMsg = $state('');

	onMount(() => {
		settings = getSettings();
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
