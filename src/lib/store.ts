import { v4 as uuidv4 } from 'uuid';
import { db } from '$lib/db';
import {
	DEFAULT_SETTINGS, DEFAULT_MUSCLE_GROUPS, PRESET_EXERCISES,
	type Split, type SplitDay, type Exercise, type ExerciseSlot,
	type WorkoutSession, type ExerciseLog, type SetLog, type Settings, type MuscleGroup, type Weekday,
	type IncrementProfile, type WorkoutBreak, type BreakReason
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

export async function initPresetExercises(): Promise<void> {
	const existing = await db.exercises.count();
	if (existing > 0) return; // Only seed on first run

	const groups = await db.muscleGroups.toArray();
	const groupMap = new Map(groups.map(g => [g.name, g.id]));

	const exercises: Exercise[] = PRESET_EXERCISES.map(preset => {
		const mainGroupId = groupMap.get(preset.mainGroup);
		if (!mainGroupId) return null;

		const secondaryIds = preset.secondaryGroups
			?.map(name => groupMap.get(name))
			.filter((id): id is string => !!id)
			.slice(0, 2);

		return {
			id: uuidv4(),
			name: preset.name,
			muscleGroupId: mainGroupId,
			secondaryMuscleGroupIds: secondaryIds?.length ? secondaryIds : undefined,
			isBodyweight: preset.isBodyweight ?? false,
			notes: preset.notes,
			isPreset: true,
			createdAt: new Date().toISOString()
		};
	}).filter((e): e is Exercise => e !== null);

	await db.exercises.bulkAdd(exercises);
}

export async function getMuscleGroups(): Promise<MuscleGroup[]> {
	return db.muscleGroups.orderBy('name').toArray();
}

export async function addMuscleGroup(name: string): Promise<MuscleGroup> {
	const group: MuscleGroup = { id: uuidv4(), name };
	await db.muscleGroups.add(group);
	return group;
}

// ─── Increment Profiles ───

export async function getIncrementProfiles(): Promise<IncrementProfile[]> {
	return db.incrementProfiles.orderBy('name').toArray();
}

export async function getIncrementProfile(id: string): Promise<IncrementProfile | undefined> {
	return db.incrementProfiles.get(id);
}

export async function createIncrementProfile(name: string, weights: number[]): Promise<IncrementProfile> {
	const sorted = [...weights].sort((a, b) => a - b);
	const profile: IncrementProfile = { id: uuidv4(), name, weights: sorted };
	await db.incrementProfiles.add(profile);
	return profile;
}

export async function updateIncrementProfile(id: string, updates: Partial<Omit<IncrementProfile, 'id'>>): Promise<void> {
	if (updates.weights) {
		updates.weights = [...updates.weights].sort((a, b) => a - b);
	}
	await db.incrementProfiles.update(id, updates);
}

export async function deleteIncrementProfile(id: string): Promise<void> {
	// Clear reference from any exercises using this profile
	const exercises = await db.exercises.filter(e => e.incrementProfileId === id).toArray();
	for (const ex of exercises) {
		await db.exercises.update(ex.id, { incrementProfileId: undefined });
	}
	await db.incrementProfiles.delete(id);
}

/**
 * Given a current weight and an increment profile, find the next weight up.
 * Returns undefined if already at max or no profile.
 */
export function getNextWeightInProfile(currentWeight: number, profile: IncrementProfile): number | undefined {
	const next = profile.weights.find(w => w > currentWeight);
	return next;
}

/**
 * Given a current weight and an increment profile, find the next weight down.
 * Returns undefined if already at min or no profile.
 */
export function getPrevWeightInProfile(currentWeight: number, profile: IncrementProfile): number | undefined {
	// Find the largest weight that is less than currentWeight
	const candidates = profile.weights.filter(w => w < currentWeight);
	return candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
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

export async function createSplitDay(splitId: string, name: string, order: number, weekday?: Weekday, defaultRepTarget?: number): Promise<SplitDay> {
	const day: SplitDay = { id: uuidv4(), splitId, name, order, weekday, defaultRepTarget };
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

export async function updateWorkoutSession(id: string, updates: Partial<Omit<WorkoutSession, 'id'>>): Promise<void> {
	await db.workoutSessions.update(id, updates);
}

export async function deleteWorkoutSession(id: string): Promise<void> {
	const logs = await db.exerciseLogs.where('sessionId').equals(id).toArray();
	for (const log of logs) {
		await db.setLogs.where('exerciseLogId').equals(log.id).delete();
	}
	await db.exerciseLogs.where('sessionId').equals(id).delete();
	await db.workoutSessions.delete(id);
}

export async function deleteExerciseLog(id: string): Promise<void> {
	await db.setLogs.where('exerciseLogId').equals(id).delete();
	await db.exerciseLogs.delete(id);
}

export async function deleteSetLog(id: string): Promise<void> {
	await db.setLogs.delete(id);
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
 * Calculate suggested weight and reps for each set in the next workout.
 *
 * Logic:
 * 1. If ALL sets hit the rep target ceiling → increase weight, reset reps
 * 2. If all sets hit their previous target → next target = lowestActualReps + 1
 * 3. If any set missed the target → target stays the same
 * 4. "Going over": if some sets exceed the target, next = lowestActualReps + 1
 *
 * Returns per-set suggestions (weight and reps for each set).
 */
export function calculateProgression(
	lastSets: SetLog[],
	repTargetCeiling: number,
	weightIncrement: number,
	customIncrements?: number[],
	incrementProfile?: IncrementProfile
): { suggestedWeight: number; suggestedReps: number }[] {
	if (lastSets.length === 0) {
		return [];
	}

	const completedSets = lastSets.filter(s => s.completed);
	if (completedSets.length === 0) {
		return lastSets.map(s => ({ suggestedWeight: s.targetWeight, suggestedReps: s.targetReps }));
	}

	const lastWeight = completedSets[0].actualWeight ?? completedSets[0].targetWeight;
	const lowestActualReps = Math.min(...completedSets.map(s => s.actualReps ?? 0));
	const allHitCeiling = completedSets.every(s => (s.actualReps ?? 0) >= repTargetCeiling);
	const previousTarget = completedSets[0].targetReps;
	const allHitTarget = completedSets.every(s => (s.actualReps ?? 0) >= previousTarget);

	if (allHitCeiling) {
		// Weight increase — all sets hit the ceiling
		let newWeight: number;

		if (incrementProfile) {
			const next = getNextWeightInProfile(lastWeight, incrementProfile);
			newWeight = next ?? lastWeight;
		} else if (customIncrements && customIncrements.length > 0) {
			const sorted = [...customIncrements].sort((a, b) => a - b);
			newWeight = lastWeight + sorted[0];
		} else {
			newWeight = lastWeight + weightIncrement;
		}

		// Reset reps: start fresh at a base level (ceiling - 4, minimum 1)
		const resetReps = Math.max(1, repTargetCeiling - 4);
		return lastSets.map(() => ({
			suggestedWeight: newWeight,
			suggestedReps: resetReps
		}));
	}

	// Rep progression — uniform target across all sets
	let nextTarget: number;
	if (allHitTarget) {
		// Succeeded: increment from lowest actual reps
		nextTarget = lowestActualReps + 1;
	} else {
		// Failed to hit target in at least one set: keep same target
		nextTarget = previousTarget;
	}

	return lastSets.map(() => ({
		suggestedWeight: lastWeight,
		suggestedReps: nextTarget
	}));
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

// ─── Workout Breaks ───

export async function getWorkoutBreaks(): Promise<WorkoutBreak[]> {
	return db.workoutBreaks.orderBy('startDate').reverse().toArray();
}

export async function getBreakForDate(date: string): Promise<WorkoutBreak | undefined> {
	return db.workoutBreaks.filter(b => date >= b.startDate && date <= b.endDate).first();
}

export async function getBreaksInRange(startDate: string, endDate: string): Promise<WorkoutBreak[]> {
	return db.workoutBreaks.filter(b => b.endDate >= startDate && b.startDate <= endDate).toArray();
}

export async function createWorkoutBreak(data: Omit<WorkoutBreak, 'id'>): Promise<WorkoutBreak> {
	const brk: WorkoutBreak = { ...data, id: uuidv4() };
	await db.workoutBreaks.add(brk);
	return brk;
}

export async function updateWorkoutBreak(id: string, updates: Partial<Omit<WorkoutBreak, 'id'>>): Promise<void> {
	await db.workoutBreaks.update(id, updates);
}

export async function deleteWorkoutBreak(id: string): Promise<void> {
	await db.workoutBreaks.delete(id);
}

// ─── Streak Calculation ───

/**
 * Calculate the current workout streak in weeks.
 * A week counts as active if it has at least one workout OR is covered by a break.
 * The streak breaks if a full week passes with no workout and no break.
 * @param gapDays Maximum days between workouts before streak breaks (default 7)
 */
export async function getWorkoutStreak(gapDays: number = 7): Promise<{
	currentStreakWeeks: number;
	currentStreakDays: number;
	longestStreakDays: number;
	totalWorkouts: number;
	lastWorkoutDate?: string;
}> {
	const sessions = await db.workoutSessions
		.where('status').equals('completed')
		.sortBy('date');
	const breaks = await db.workoutBreaks.toArray();

	if (sessions.length === 0) {
		return { currentStreakWeeks: 0, currentStreakDays: 0, longestStreakDays: 0, totalWorkouts: 0 };
	}

	const today = new Date().toISOString().split('T')[0];

	// Build a set of all "active" dates (workout days + break days)
	const activeDates = new Set<string>();
	for (const s of sessions) {
		activeDates.add(s.date);
	}
	for (const b of breaks) {
		const start = new Date(b.startDate);
		const end = new Date(b.endDate);
		for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			activeDates.add(d.toISOString().split('T')[0]);
		}
	}

	// Calculate current streak: count backwards from today
	let currentStreakDays = 0;
	let d = new Date(today);
	let consecutiveInactiveDays = 0;

	while (consecutiveInactiveDays < gapDays) {
		const dateStr = d.toISOString().split('T')[0];
		if (activeDates.has(dateStr)) {
			currentStreakDays++;
			consecutiveInactiveDays = 0;
		} else {
			consecutiveInactiveDays++;
		}
		d.setDate(d.getDate() - 1);
		// Safety: don't go back more than 5 years
		if (currentStreakDays + consecutiveInactiveDays > 1825) break;
	}

	// Current streak in weeks
	const currentStreakWeeks = Math.floor(currentStreakDays / 7);

	// Calculate longest streak
	let longestStreakDays = 0;
	let tempStreak = 0;
	let tempInactive = 0;

	const sortedDates = [...activeDates].sort();
	if (sortedDates.length > 0) {
		const first = new Date(sortedDates[0]);
		const last = new Date(sortedDates[sortedDates.length - 1]);
		tempStreak = 0;
		tempInactive = 0;

		for (let dd = new Date(first); dd <= last; dd.setDate(dd.getDate() + 1)) {
			const ds = dd.toISOString().split('T')[0];
			if (activeDates.has(ds)) {
				tempStreak++;
				tempInactive = 0;
				longestStreakDays = Math.max(longestStreakDays, tempStreak);
			} else {
				tempInactive++;
				if (tempInactive >= gapDays) {
					tempStreak = 0;
				}
			}
		}
	}

	const lastWorkoutDate = sessions.length > 0 ? sessions[sessions.length - 1].date : undefined;

	return {
		currentStreakWeeks,
		currentStreakDays,
		longestStreakDays,
		totalWorkouts: sessions.length,
		lastWorkoutDate
	};
}

// ─── Data Export / Import ───

export async function exportAllData(): Promise<string> {
	const data = {
		version: 5,
		exportedAt: new Date().toISOString(),
		settings: getSettings(),
		splits: await db.splits.toArray(),
		splitDays: await db.splitDays.toArray(),
		muscleGroups: await db.muscleGroups.toArray(),
		exercises: await db.exercises.toArray(),
		exerciseSlots: await db.exerciseSlots.toArray(),
		workoutSessions: await db.workoutSessions.toArray(),
		exerciseLogs: await db.exerciseLogs.toArray(),
		setLogs: await db.setLogs.toArray(),
		incrementProfiles: await db.incrementProfiles.toArray(),
		workoutBreaks: await db.workoutBreaks.toArray()
	};
	return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
	const data = JSON.parse(json);
	if (![1, 2, 3, 4, 5].includes(data.version)) throw new Error('Unsupported export version');

	await db.transaction('rw',
		[db.splits, db.splitDays, db.muscleGroups, db.exercises,
		 db.exerciseSlots, db.workoutSessions, db.exerciseLogs, db.setLogs, db.incrementProfiles, db.workoutBreaks],
		async () => {
			await db.splits.clear();
			await db.splitDays.clear();
			await db.muscleGroups.clear();
			await db.exercises.clear();
			await db.exerciseSlots.clear();
			await db.workoutSessions.clear();
			await db.exerciseLogs.clear();
			await db.setLogs.clear();
			await db.incrementProfiles.clear();
			await db.workoutBreaks.clear();

			if (data.splits) await db.splits.bulkAdd(data.splits);
			if (data.splitDays) await db.splitDays.bulkAdd(data.splitDays);
			if (data.muscleGroups) await db.muscleGroups.bulkAdd(data.muscleGroups);
			if (data.exercises) await db.exercises.bulkAdd(data.exercises);
			if (data.exerciseSlots) await db.exerciseSlots.bulkAdd(data.exerciseSlots);
			if (data.workoutSessions) await db.workoutSessions.bulkAdd(data.workoutSessions);
			if (data.exerciseLogs) await db.exerciseLogs.bulkAdd(data.exerciseLogs);
			if (data.setLogs) await db.setLogs.bulkAdd(data.setLogs);
			if (data.incrementProfiles) await db.incrementProfiles.bulkAdd(data.incrementProfiles);
			if (data.workoutBreaks) await db.workoutBreaks.bulkAdd(data.workoutBreaks);
		}
	);

	if (data.settings) saveSettings(data.settings);
}
