import { v4 as uuidv4 } from 'uuid';
import { db } from '$lib/db';
import {
	DEFAULT_SETTINGS, DEFAULT_MUSCLE_GROUPS,
	type Split, type SplitDay, type Exercise, type ExerciseSlot,
	type WorkoutSession, type ExerciseLog, type SetLog, type Settings, type MuscleGroup, type Weekday
} from '$lib/types';

// ─── Settings ───

const SETTINGS_KEY = 'workout-tracker-settings';

export function getSettings(): Settings {
	if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
	const raw = localStorage.getItem(SETTINGS_KEY);
	return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ─── Muscle Groups ───

export async function initMuscleGroups(): Promise<void> {
	const count = await db.muscleGroups.count();
	if (count === 0) {
		const groups = DEFAULT_MUSCLE_GROUPS.map(name => ({ id: uuidv4(), name }));
		await db.muscleGroups.bulkAdd(groups);
	}
}

export async function getMuscleGroups(): Promise<MuscleGroup[]> {
	return db.muscleGroups.orderBy('name').toArray();
}

export async function addMuscleGroup(name: string): Promise<MuscleGroup> {
	const group: MuscleGroup = { id: uuidv4(), name };
	await db.muscleGroups.add(group);
	return group;
}

// ─── Splits ───

export async function getSplits(): Promise<Split[]> {
	return db.splits.toArray();
}

export async function getSplit(id: string): Promise<Split | undefined> {
	return db.splits.get(id);
}

export async function createSplit(name: string, type: 'weekday' | 'sequential'): Promise<Split> {
	const split: Split = { id: uuidv4(), name, type, createdAt: new Date().toISOString() };
	await db.splits.add(split);
	return split;
}

export async function updateSplit(id: string, updates: Partial<Omit<Split, 'id'>>): Promise<void> {
	await db.splits.update(id, updates);
}

export async function deleteSplit(id: string): Promise<void> {
	const days = await db.splitDays.where('splitId').equals(id).toArray();
	for (const day of days) {
		await db.exerciseSlots.where('splitDayId').equals(day.id).delete();
	}
	await db.splitDays.where('splitId').equals(id).delete();
	await db.splits.delete(id);
}

// ─── Split Days ───

export async function getSplitDays(splitId: string): Promise<SplitDay[]> {
	return db.splitDays.where('splitId').equals(splitId).sortBy('order');
}

export async function createSplitDay(splitId: string, name: string, order: number, weekday?: Weekday): Promise<SplitDay> {
	const day: SplitDay = { id: uuidv4(), splitId, name, order, weekday };
	await db.splitDays.add(day);
	return day;
}

export async function updateSplitDay(id: string, updates: Partial<Omit<SplitDay, 'id'>>): Promise<void> {
	await db.splitDays.update(id, updates);
}

export async function deleteSplitDay(id: string): Promise<void> {
	await db.exerciseSlots.where('splitDayId').equals(id).delete();
	await db.splitDays.delete(id);
}

// ─── Exercises ───

export async function getExercises(): Promise<Exercise[]> {
	return db.exercises.orderBy('name').toArray();
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
	return db.exercises.get(id);
}

export async function createExercise(data: Omit<Exercise, 'id' | 'createdAt'>): Promise<Exercise> {
	const exercise: Exercise = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
	await db.exercises.add(exercise);
	return exercise;
}

export async function updateExercise(id: string, updates: Partial<Omit<Exercise, 'id'>>): Promise<void> {
	await db.exercises.update(id, updates);
}

export async function deleteExercise(id: string): Promise<void> {
	await db.exercises.delete(id);
}

// ─── Exercise Slots ───

export async function getExerciseSlots(splitDayId: string): Promise<ExerciseSlot[]> {
	return db.exerciseSlots.where('splitDayId').equals(splitDayId).sortBy('order');
}

export async function createExerciseSlot(data: Omit<ExerciseSlot, 'id'>): Promise<ExerciseSlot> {
	const slot: ExerciseSlot = { ...data, id: uuidv4() };
	await db.exerciseSlots.add(slot);
	return slot;
}

export async function updateExerciseSlot(id: string, updates: Partial<Omit<ExerciseSlot, 'id'>>): Promise<void> {
	await db.exerciseSlots.update(id, updates);
}

export async function deleteExerciseSlot(id: string): Promise<void> {
	await db.exerciseSlots.delete(id);
}

// ─── Workout Sessions ───

export async function getActiveSession(): Promise<WorkoutSession | undefined> {
	return db.workoutSessions.where('status').equals('in-progress').first();
}

export async function getSessionsByDate(date: string): Promise<WorkoutSession[]> {
	return db.workoutSessions.where('date').equals(date).toArray();
}

export async function getAllSessions(): Promise<WorkoutSession[]> {
	return db.workoutSessions.orderBy('date').reverse().toArray();
}

export async function getSessionsForSplitDay(splitDayId: string): Promise<WorkoutSession[]> {
	return db.workoutSessions.where('splitDayId').equals(splitDayId).sortBy('date');
}

export async function startWorkoutSession(splitDayId: string, splitId: string): Promise<WorkoutSession> {
	const now = new Date();
	const session: WorkoutSession = {
		id: uuidv4(),
		splitDayId,
		splitId,
		date: now.toISOString().split('T')[0],
		startedAt: now.toISOString(),
		status: 'in-progress'
	};
	await db.workoutSessions.add(session);
	return session;
}

export async function finishWorkoutSession(id: string, notes?: string): Promise<void> {
	await db.workoutSessions.update(id, {
		status: 'completed',
		finishedAt: new Date().toISOString(),
		notes
	});
}

// ─── Exercise Logs ───

export async function getExerciseLogs(sessionId: string): Promise<ExerciseLog[]> {
	return db.exerciseLogs.where('sessionId').equals(sessionId).sortBy('order');
}

export async function getExerciseLogsByExercise(exerciseId: string): Promise<ExerciseLog[]> {
	return db.exerciseLogs.where('exerciseId').equals(exerciseId).toArray();
}

export async function createExerciseLog(data: Omit<ExerciseLog, 'id' | 'startedAt'>): Promise<ExerciseLog> {
	const log: ExerciseLog = { ...data, id: uuidv4(), startedAt: new Date().toISOString() };
	await db.exerciseLogs.add(log);
	return log;
}

export async function finishExerciseLog(id: string): Promise<void> {
	await db.exerciseLogs.update(id, { finishedAt: new Date().toISOString() });
}

// ─── Set Logs ───

export async function getSetLogs(exerciseLogId: string): Promise<SetLog[]> {
	return db.setLogs.where('exerciseLogId').equals(exerciseLogId).sortBy('setNumber');
}

export async function createSetLog(data: Omit<SetLog, 'id'>): Promise<SetLog> {
	const log: SetLog = { ...data, id: uuidv4() };
	await db.setLogs.add(log);
	return log;
}

export async function updateSetLog(id: string, updates: Partial<Omit<SetLog, 'id'>>): Promise<void> {
	await db.setLogs.update(id, updates);
}

// ─── Progression Logic ───

/**
 * Get the last completed exercise log + sets for a given exercise,
 * looking only at sessions for the same split day.
 */
export async function getLastPerformance(exerciseId: string, splitDayId: string): Promise<{
	weight: number;
	reps: number;
	sets: SetLog[];
} | null> {
	const sessions = await db.workoutSessions
		.where('splitDayId').equals(splitDayId)
		.and(s => s.status === 'completed')
		.reverse()
		.sortBy('date');

	for (const session of sessions) {
		const logs = await db.exerciseLogs
			.where('sessionId').equals(session.id)
			.and(l => l.exerciseId === exerciseId)
			.toArray();

		if (logs.length > 0) {
			const sets = await db.setLogs
				.where('exerciseLogId').equals(logs[0].id)
				.and(s => s.completed && !s.isWarmup)
				.sortBy('setNumber');

			if (sets.length > 0) {
				const lastWeight = sets[0].actualWeight ?? sets[0].targetWeight;
				const lastReps = Math.min(...sets.map(s => s.actualReps ?? 0));
				return { weight: lastWeight, reps: lastReps, sets };
			}
		}
	}
	return null;
}

/**
 * Calculate suggested weight and reps for the next workout.
 * - If all sets hit the rep target → increase weight, reset reps
 * - Otherwise → increase target reps by 1
 */
export function calculateProgression(
	lastSets: SetLog[],
	repTarget: number,
	weightIncrement: number,
	customIncrements?: number[]
): { suggestedWeight: number; suggestedReps: number } {
	if (lastSets.length === 0) {
		return { suggestedWeight: 0, suggestedReps: repTarget - 4 };
	}

	const lastWeight = lastSets[0].actualWeight ?? lastSets[0].targetWeight;
	const allSetsHitTarget = lastSets.every(s => (s.actualReps ?? 0) >= repTarget);

	if (allSetsHitTarget) {
		// Weight increase
		let increment = weightIncrement;
		if (customIncrements && customIncrements.length > 0) {
			// Find the smallest increment that's available above current weight
			const sorted = [...customIncrements].sort((a, b) => a - b);
			increment = sorted[0]; // Use smallest available increment
		}
		return {
			suggestedWeight: lastWeight + increment,
			suggestedReps: lastSets[0].targetReps // Reset to original target reps (lower end)
		};
	}

	// Rep increase: suggest one more rep than last achieved
	const minReps = Math.min(...lastSets.map(s => s.actualReps ?? 0));
	return {
		suggestedWeight: lastWeight,
		suggestedReps: minReps + 1
	};
}

// ─── Alternating Exercise Logic ───

/**
 * For alternating exercise slots, determine which exercise to suggest this session.
 * Cycles through all exercises in the slot (primary + alternates) in round-robin fashion.
 */
export async function getAlternatingExerciseId(slot: ExerciseSlot, splitDayId: string): Promise<string> {
	const allIds = getAllExerciseIdsForSlot(slot);
	if (allIds.length <= 1) return slot.exerciseId;

	const sessions = await db.workoutSessions
		.where('splitDayId').equals(splitDayId)
		.and(s => s.status === 'completed')
		.reverse()
		.sortBy('date');

	if (sessions.length === 0) return allIds[0];

	// Check last session for this split day
	const lastSession = sessions[0];
	const logs = await db.exerciseLogs
		.where('sessionId').equals(lastSession.id)
		.and(l => l.slotId === slot.id)
		.toArray();

	if (logs.length === 0) return allIds[0];

	// Return the next exercise in rotation
	const lastUsed = logs[0].exerciseId;
	const lastIndex = allIds.indexOf(lastUsed);
	const nextIndex = (lastIndex + 1) % allIds.length;
	return allIds[nextIndex];
}

/**
 * Get all exercise IDs for a slot (primary + alternates), handling both old and new format.
 */
export function getAllExerciseIdsForSlot(slot: ExerciseSlot): string[] {
	const ids = [slot.exerciseId];
	if (slot.alternateExerciseIds && slot.alternateExerciseIds.length > 0) {
		ids.push(...slot.alternateExerciseIds);
	} else if (slot.alternateExerciseId) {
		ids.push(slot.alternateExerciseId);
	}
	return ids;
}

// ─── Today's Workout ───

export async function getTodaysSplitDay(split: Split): Promise<SplitDay | undefined> {
	const days = await getSplitDays(split.id);
	if (days.length === 0) return undefined;

	if (split.type === 'weekday') {
		const today = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()] as string;
		return days.find(d => d.weekday === today);
	}

	// Sequential: find the next day after the last completed session
	const sessions = await db.workoutSessions
		.where('splitId').equals(split.id)
		.and(s => s.status === 'completed')
		.reverse()
		.sortBy('date');

	if (sessions.length === 0) return days[0];

	const lastDay = days.find(d => d.id === sessions[0].splitDayId);
	if (!lastDay) return days[0];

	const nextIndex = (lastDay.order + 1) % days.length;
	return days.find(d => d.order === nextIndex) ?? days[0];
}

// ─── Stats & Progress ───

export async function getExerciseHistory(exerciseId: string): Promise<Array<{
	date: string;
	weight: number;
	totalVolume: number;
	totalReps: number;
	totalSets: number;
	estimated1RM: number;
}>> {
	const logs = await db.exerciseLogs.where('exerciseId').equals(exerciseId).toArray();
	const history: Array<{
		date: string; weight: number; totalVolume: number;
		totalReps: number; totalSets: number; estimated1RM: number;
	}> = [];

	for (const log of logs) {
		const session = await db.workoutSessions.get(log.sessionId);
		if (!session || session.status !== 'completed') continue;

		const sets = await db.setLogs
			.where('exerciseLogId').equals(log.id)
			.and(s => s.completed && !s.isWarmup)
			.toArray();

		if (sets.length === 0) continue;

		const maxWeight = Math.max(...sets.map(s => s.actualWeight ?? 0));
		const totalReps = sets.reduce((sum, s) => sum + (s.actualReps ?? 0), 0);
		const totalVolume = sets.reduce((sum, s) => sum + (s.actualWeight ?? 0) * (s.actualReps ?? 0), 0);

		// Epley formula for estimated 1RM
		const bestSet = sets.reduce((best, s) => {
			const w = s.actualWeight ?? 0;
			const r = s.actualReps ?? 0;
			const e1rm = r === 1 ? w : w * (1 + r / 30);
			const bestE1rm = (best.actualReps ?? 0) === 1
				? (best.actualWeight ?? 0)
				: (best.actualWeight ?? 0) * (1 + (best.actualReps ?? 0) / 30);
			return e1rm > bestE1rm ? s : best;
		}, sets[0]);

		const bestW = bestSet.actualWeight ?? 0;
		const bestR = bestSet.actualReps ?? 0;
		const estimated1RM = bestR === 1 ? bestW : bestW * (1 + bestR / 30);

		history.push({
			date: session.date,
			weight: maxWeight,
			totalVolume,
			totalReps,
			totalSets: sets.length,
			estimated1RM: Math.round(estimated1RM * 10) / 10
		});
	}

	return history.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Data Export / Import ───

export async function exportAllData(): Promise<string> {
	const data = {
		version: 1,
		exportedAt: new Date().toISOString(),
		settings: getSettings(),
		splits: await db.splits.toArray(),
		splitDays: await db.splitDays.toArray(),
		muscleGroups: await db.muscleGroups.toArray(),
		exercises: await db.exercises.toArray(),
		exerciseSlots: await db.exerciseSlots.toArray(),
		workoutSessions: await db.workoutSessions.toArray(),
		exerciseLogs: await db.exerciseLogs.toArray(),
		setLogs: await db.setLogs.toArray()
	};
	return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
	const data = JSON.parse(json);
	if (data.version !== 1) throw new Error('Unsupported export version');

	await db.transaction('rw',
		[db.splits, db.splitDays, db.muscleGroups, db.exercises,
		 db.exerciseSlots, db.workoutSessions, db.exerciseLogs, db.setLogs],
		async () => {
			await db.splits.clear();
			await db.splitDays.clear();
			await db.muscleGroups.clear();
			await db.exercises.clear();
			await db.exerciseSlots.clear();
			await db.workoutSessions.clear();
			await db.exerciseLogs.clear();
			await db.setLogs.clear();

			if (data.splits) await db.splits.bulkAdd(data.splits);
			if (data.splitDays) await db.splitDays.bulkAdd(data.splitDays);
			if (data.muscleGroups) await db.muscleGroups.bulkAdd(data.muscleGroups);
			if (data.exercises) await db.exercises.bulkAdd(data.exercises);
			if (data.exerciseSlots) await db.exerciseSlots.bulkAdd(data.exerciseSlots);
			if (data.workoutSessions) await db.workoutSessions.bulkAdd(data.workoutSessions);
			if (data.exerciseLogs) await db.exerciseLogs.bulkAdd(data.exerciseLogs);
			if (data.setLogs) await db.setLogs.bulkAdd(data.setLogs);
		}
	);

	if (data.settings) saveSettings(data.settings);
}
