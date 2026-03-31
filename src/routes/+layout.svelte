<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { initMuscleGroups, initPresetExercises } from '$lib/store';

	let { children } = $props();

	onMount(async () => {
		await initMuscleGroups();
		await initPresetExercises();

		// Register service worker for PWA
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js');
		}
	});

	const navItems = [
		{ href: '/', label: 'Home', icon: '🏠' },
		{ href: '/splits', label: 'Splits', icon: '📋' },
		{ href: '/exercises', label: 'Exercises', icon: '💪' },
		{ href: '/progress', label: 'Progress', icon: '📊' },
		{ href: '/calendar', label: 'Calendar', icon: '📅' },
		{ href: '/settings', label: 'Settings', icon: '⚙️' }
	];
</script>

<div class="flex flex-col min-h-[100dvh] bg-dark-bg">
	<main class="flex-1 pb-20 overflow-y-auto">
		{@render children()}
	</main>

	<nav class="fixed bottom-0 left-0 right-0 bg-dark-surface border-t border-dark-border safe-area-bottom">
		<div class="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
			{#each navItems as item}
				<a
					href={item.href}
					class="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors text-xs
						{$page.url.pathname === item.href || ($page.url.pathname.startsWith(item.href) && item.href !== '/')
							? 'text-accent'
							: 'text-text-secondary hover:text-text-primary'}"
				>
					<span class="text-lg">{item.icon}</span>
					<span>{item.label}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>

<style>
	.safe-area-bottom {
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
</style>
