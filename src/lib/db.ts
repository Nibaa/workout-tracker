import Dexie, { type EntityTable } from 'dexie';
import type {
	Split, SplitDay, Exercise, ExerciseSlot,
	WorkoutSession, ExerciseLog, SetLog, MuscleGroup
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

export { db };
