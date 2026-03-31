export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type ExerciseSlotType = 'core' | 'alternating' | 'optional';

export interface Split {
	id: string;
	name: string;
	type: 'weekday' | 'sequential';
	createdAt: string;
}

export interface SplitDay {
	id: string;
	splitId: string;
	name: string;
	weekday?: Weekday;
	order: number;
}

export interface MuscleGroup {
	id: string;
	name: string;
}

export interface Exercise {
	id: string;
	name: string;
	muscleGroupId: string;
	isBodyweight: boolean;
	notes?: string;
	/** Custom weight increments for adjustable equipment (e.g., [1, 1.5, 2, 2.5]) */
	weightIncrements?: number[];
	/** Per-exercise rep target override. When all sets hit this, suggest weight increase */
	repTarget?: number;
	createdAt: string;
}

export interface ExerciseSlot {
	id: string;
	splitDayId: string;
	order: number;
	type: ExerciseSlotType;
	/** Primary exercise ID */
	exerciseId: string;
	/** Alternate exercise IDs (for 'alternating' type — any number of alternatives) */
	alternateExerciseIds?: string[];
	/** @deprecated Use alternateExerciseIds instead. Kept for DB migration compatibility. */
	alternateExerciseId?: string;
	/** Superset group key — slots sharing the same key are done together */
	supersetGroup?: string;
	targetSets: number;
	targetReps?: number;
	restSeconds?: number;
}

export interface WorkoutSession {
	id: string;
	splitDayId: string;
	splitId: string;
	date: string; // ISO date string
	startedAt: string;
	finishedAt?: string;
	status: 'in-progress' | 'completed';
	notes?: string;
}

export interface ExerciseLog {
	id: string;
	sessionId: string;
	exerciseId: string;
	slotId: string;
	order: number;
	startedAt: string;
	finishedAt?: string;
}

export interface SetLog {
	id: string;
	exerciseLogId: string;
	setNumber: number;
	targetWeight: number;
	targetReps: number;
	actualWeight?: number;
	actualReps?: number;
	isWarmup: boolean;
	completed: boolean;
}

export interface Settings {
	defaultRestSeconds: number;
	defaultRepTarget: number;
	defaultWeightIncrement: number;
	theme: 'dark' | 'light';
}

export const DEFAULT_SETTINGS: Settings = {
	defaultRestSeconds: 90,
	defaultRepTarget: 12,
	defaultWeightIncrement: 2.5,
	theme: 'dark'
};

export const WEEKDAYS: Weekday[] = [
	'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
	friday: 'Friday',
	saturday: 'Saturday',
	sunday: 'Sunday'
};

export const DEFAULT_MUSCLE_GROUPS = [
	'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
	'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full Body'
];
