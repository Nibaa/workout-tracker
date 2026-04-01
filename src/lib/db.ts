import Dexie, { type EntityTable } from 'dexie';
import type {
	Split, SplitDay, Exercise, ExerciseSlot,
	WorkoutSession, ExerciseLog, SetLog, MuscleGroup, IncrementProfile, WorkoutBreak
} from '$lib/types';

const db = new Dexie('WorkoutTracker') as Dexie & {
	splits: EntityTable<Split, 'id'>;
	splitDays: EntityTable<SplitDay, 'id'>;
	muscleGroups: EntityTable<MuscleGroup, 'id'>;
	exercises: EntityTable<Exercise, 'id'>;
	exerciseSlots: EntityTable<ExerciseSlot, 'id'>;
	workoutSessions: EntityTable<WorkoutSession, 'id'>;
	exerciseLogs: EntityTable<ExerciseLog, 'id'>;
	setLogs: EntityTable<SetLog, 'id'>;
	incrementProfiles: EntityTable<IncrementProfile, 'id'>;
	workoutBreaks: EntityTable<WorkoutBreak, 'id'>;
};

db.version(1).stores({
	splits: 'id, type, createdAt',
	splitDays: 'id, splitId, weekday, order',
	muscleGroups: 'id, name',
	exercises: 'id, name, muscleGroupId, createdAt',
	exerciseSlots: 'id, splitDayId, order, exerciseId, alternateExerciseId',
	workoutSessions: 'id, splitDayId, splitId, date, status',
	exerciseLogs: 'id, sessionId, exerciseId, slotId',
	setLogs: 'id, exerciseLogId, setNumber'
});

// Migration: add alternateExerciseIds array field
db.version(2).stores({
	splits: 'id, type, createdAt',
	splitDays: 'id, splitId, weekday, order',
	muscleGroups: 'id, name',
	exercises: 'id, name, muscleGroupId, createdAt',
	exerciseSlots: 'id, splitDayId, order, exerciseId',
	workoutSessions: 'id, splitDayId, splitId, date, status',
	exerciseLogs: 'id, sessionId, exerciseId, slotId',
	setLogs: 'id, exerciseLogId, setNumber'
}).upgrade(tx => {
	// Migrate old alternateExerciseId to alternateExerciseIds array
	return tx.table('exerciseSlots').toCollection().modify(slot => {
		if (slot.alternateExerciseId && !slot.alternateExerciseIds) {
			slot.alternateExerciseIds = [slot.alternateExerciseId];
		}
	});
});

// Migration: add incrementProfiles table
db.version(3).stores({
	splits: 'id, type, createdAt',
	splitDays: 'id, splitId, weekday, order',
	muscleGroups: 'id, name',
	exercises: 'id, name, muscleGroupId, createdAt',
	exerciseSlots: 'id, splitDayId, order, exerciseId',
	workoutSessions: 'id, splitDayId, splitId, date, status',
	exerciseLogs: 'id, sessionId, exerciseId, slotId',
	setLogs: 'id, exerciseLogId, setNumber',
	incrementProfiles: 'id, name'
});

// Migration: add secondaryMuscleGroupIds to exercises, defaultRepTarget to splitDays
db.version(4).stores({
	splits: 'id, type, createdAt',
	splitDays: 'id, splitId, weekday, order',
	muscleGroups: 'id, name',
	exercises: 'id, name, muscleGroupId, createdAt',
	exerciseSlots: 'id, splitDayId, order, exerciseId',
	workoutSessions: 'id, splitDayId, splitId, date, status',
	exerciseLogs: 'id, sessionId, exerciseId, slotId',
	setLogs: 'id, exerciseLogId, setNumber',
	incrementProfiles: 'id, name'
});

// Migration: add workoutBreaks table, initialWeight/initialReps/initialSets on exercises
db.version(5).stores({
	splits: 'id, type, createdAt',
	splitDays: 'id, splitId, weekday, order',
	muscleGroups: 'id, name',
	exercises: 'id, name, muscleGroupId, createdAt',
	exerciseSlots: 'id, splitDayId, order, exerciseId',
	workoutSessions: 'id, splitDayId, splitId, date, status',
	exerciseLogs: 'id, sessionId, exerciseId, slotId',
	setLogs: 'id, exerciseLogId, setNumber',
	incrementProfiles: 'id, name',
	workoutBreaks: 'id, startDate, endDate, reason'
});

// Migration: move weightIncrements, incrementProfileId, repTarget, initialWeight/Reps/Sets
// from exercises to exerciseSlots (split-specific, not exercise-inherent)
db.version(6).stores({
	splits: 'id, type, createdAt',
	splitDays: 'id, splitId, weekday, order',
	muscleGroups: 'id, name',
	exercises: 'id, name, muscleGroupId, createdAt',
	exerciseSlots: 'id, splitDayId, order, exerciseId',
	workoutSessions: 'id, splitDayId, splitId, date, status',
	exerciseLogs: 'id, sessionId, exerciseId, slotId',
	setLogs: 'id, exerciseLogId, setNumber',
	incrementProfiles: 'id, name',
	workoutBreaks: 'id, startDate, endDate, reason'
}).upgrade(tx => {
	// Copy fields from exercises to their slots as a migration convenience
	return tx.table('exercises').toCollection().each(async (exercise: any) => {
		if (exercise.incrementProfileId || exercise.weightIncrements || exercise.repTarget ||
			exercise.initialWeight !== undefined || exercise.initialReps !== undefined || exercise.initialSets) {
			// Find all slots using this exercise and apply the exercise-level values as defaults
			const slots = await tx.table('exerciseSlots').filter(
				(slot: any) => slot.exerciseId === exercise.id
			).toArray();
			for (const slot of slots) {
				const updates: any = {};
				if (exercise.incrementProfileId && !slot.incrementProfileId) updates.incrementProfileId = exercise.incrementProfileId;
				if (exercise.weightIncrements && !slot.weightIncrements) updates.weightIncrements = exercise.weightIncrements;
				if (exercise.repTarget && !slot.repTarget) updates.repTarget = exercise.repTarget;
				if (exercise.initialWeight !== undefined && slot.initialWeight === undefined) updates.initialWeight = exercise.initialWeight;
				if (exercise.initialReps !== undefined && slot.initialReps === undefined) updates.initialReps = exercise.initialReps;
				if (exercise.initialSets && !slot.initialSets) updates.initialSets = exercise.initialSets;
				if (Object.keys(updates).length > 0) {
					await tx.table('exerciseSlots').update(slot.id, updates);
				}
			}
		}
	});
});

export { db };
