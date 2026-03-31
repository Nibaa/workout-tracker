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
	/** Default rep target for exercises in this split day (overrides global, overridden by exercise-level) */
	defaultRepTarget?: number;
}

export interface MuscleGroup {
	id: string;
	name: string;
}

export interface IncrementProfile {
	id: string;
	name: string;
	/** Sorted list of available weights in kg (e.g., [5, 7.5, 10, 12.5, 15, 20, 25, 30]) */
	weights: number[];
}

export interface Exercise {
	id: string;
	name: string;
	muscleGroupId: string;
	/** Up to 2 secondary muscle group IDs */
	secondaryMuscleGroupIds?: string[];
	isBodyweight: boolean;
	notes?: string;
	/** Custom weight increments for adjustable equipment (e.g., [1, 1.5, 2, 2.5]) */
	weightIncrements?: number[];
	/** Reference to an increment profile for available weights */
	incrementProfileId?: string;
	/** Per-exercise rep target override. When all sets hit this, suggest weight increase */
	repTarget?: number;
	/** Whether this is a preset exercise (not deletable, but editable) */
	isPreset?: boolean;
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

/**
 * Preset exercises with muscle group mappings.
 * mainGroup must match a DEFAULT_MUSCLE_GROUPS entry.
 * secondaryGroups are optional (up to 2).
 */
export interface PresetExerciseDef {
	name: string;
	mainGroup: string;
	secondaryGroups?: string[];
	isBodyweight?: boolean;
	notes?: string;
}

export const PRESET_EXERCISES: PresetExerciseDef[] = [
	// Chest
	{ name: 'Incline Press', mainGroup: 'Chest', secondaryGroups: ['Shoulders', 'Triceps'] },
	{ name: 'Flat Bench Press', mainGroup: 'Chest', secondaryGroups: ['Shoulders', 'Triceps'] },
	{ name: 'Decline Press', mainGroup: 'Chest', secondaryGroups: ['Triceps'] },
	{ name: 'Push-Up', mainGroup: 'Chest', secondaryGroups: ['Shoulders', 'Triceps'], isBodyweight: true },
	{ name: 'Dumbbell Fly', mainGroup: 'Chest', secondaryGroups: ['Shoulders'] },
	{ name: 'Incline Fly', mainGroup: 'Chest', secondaryGroups: ['Shoulders'] },
	{ name: 'Cable Crossover', mainGroup: 'Chest', secondaryGroups: ['Shoulders'] },
	{ name: 'Chest Dip', mainGroup: 'Chest', secondaryGroups: ['Triceps', 'Shoulders'], isBodyweight: true },

	// Back
	{ name: 'Bent-Over Row', mainGroup: 'Back', secondaryGroups: ['Biceps', 'Core'] },
	{ name: 'One-Handed Row', mainGroup: 'Back', secondaryGroups: ['Biceps', 'Core'] },
	{ name: 'Pull-Up', mainGroup: 'Back', secondaryGroups: ['Biceps', 'Forearms'], isBodyweight: true },
	{ name: 'Chin-Up', mainGroup: 'Back', secondaryGroups: ['Biceps'], isBodyweight: true },
	{ name: 'Lat Pulldown', mainGroup: 'Back', secondaryGroups: ['Biceps'] },
	{ name: 'Seated Cable Row', mainGroup: 'Back', secondaryGroups: ['Biceps'] },
	{ name: 'T-Bar Row', mainGroup: 'Back', secondaryGroups: ['Biceps', 'Core'] },
	{ name: '1-Arm Reverse Fly', mainGroup: 'Back', secondaryGroups: ['Shoulders'] },
	{ name: 'Face Pull', mainGroup: 'Back', secondaryGroups: ['Shoulders'] },

	// Shoulders
	{ name: 'Seated Overhead Press', mainGroup: 'Shoulders', secondaryGroups: ['Triceps'] },
	{ name: 'Standing Overhead Press', mainGroup: 'Shoulders', secondaryGroups: ['Triceps', 'Core'] },
	{ name: 'Seated Y Lateral Raise', mainGroup: 'Shoulders' },
	{ name: 'Lateral Raise', mainGroup: 'Shoulders' },
	{ name: 'Front Raise', mainGroup: 'Shoulders', secondaryGroups: ['Chest'] },
	{ name: 'Arnold Press', mainGroup: 'Shoulders', secondaryGroups: ['Triceps'] },
	{ name: 'Upright Row', mainGroup: 'Shoulders', secondaryGroups: ['Biceps'] },
	{ name: 'Rear Delt Fly', mainGroup: 'Shoulders', secondaryGroups: ['Back'] },
	{ name: 'Shrugs', mainGroup: 'Shoulders' },

	// Biceps
	{ name: 'Incline Curl', mainGroup: 'Biceps', secondaryGroups: ['Forearms'] },
	{ name: 'Preacher Curl', mainGroup: 'Biceps', secondaryGroups: ['Forearms'] },
	{ name: 'Barbell Curl', mainGroup: 'Biceps', secondaryGroups: ['Forearms'] },
	{ name: 'Hammer Curl', mainGroup: 'Biceps', secondaryGroups: ['Forearms'] },
	{ name: 'Concentration Curl', mainGroup: 'Biceps' },
	{ name: 'Cable Curl', mainGroup: 'Biceps' },

	// Triceps
	{ name: 'Incline Tricep Extension', mainGroup: 'Triceps' },
	{ name: 'Overhead Tricep Extension', mainGroup: 'Triceps' },
	{ name: 'Skull Crusher', mainGroup: 'Triceps' },
	{ name: 'Tricep Pushdown', mainGroup: 'Triceps' },
	{ name: 'Close-Grip Bench Press', mainGroup: 'Triceps', secondaryGroups: ['Chest'] },
	{ name: 'Dips', mainGroup: 'Triceps', secondaryGroups: ['Chest', 'Shoulders'], isBodyweight: true },
	{ name: 'Kickback', mainGroup: 'Triceps' },

	// Legs
	{ name: 'Barbell Squat', mainGroup: 'Quadriceps', secondaryGroups: ['Glutes', 'Core'] },
	{ name: 'Bulgarian Squat', mainGroup: 'Quadriceps', secondaryGroups: ['Glutes'] },
	{ name: 'Leg Press', mainGroup: 'Quadriceps', secondaryGroups: ['Glutes'] },
	{ name: 'Leg Extension', mainGroup: 'Quadriceps' },
	{ name: 'Lunge', mainGroup: 'Quadriceps', secondaryGroups: ['Glutes'] },
	{ name: 'Goblet Squat', mainGroup: 'Quadriceps', secondaryGroups: ['Glutes', 'Core'] },
	{ name: 'Dumbbell Deadlift', mainGroup: 'Hamstrings', secondaryGroups: ['Glutes', 'Back'] },
	{ name: 'Romanian Deadlift', mainGroup: 'Hamstrings', secondaryGroups: ['Glutes', 'Back'] },
	{ name: 'Leg Curl', mainGroup: 'Hamstrings' },
	{ name: 'Hip Thrust', mainGroup: 'Glutes', secondaryGroups: ['Hamstrings'] },
	{ name: 'Glute Bridge', mainGroup: 'Glutes', secondaryGroups: ['Hamstrings'], isBodyweight: true },
	{ name: 'Calf Raise', mainGroup: 'Calves' },
	{ name: 'Seated Calf Raise', mainGroup: 'Calves' },

	// Core
	{ name: 'Plank', mainGroup: 'Core', isBodyweight: true },
	{ name: 'Crunch', mainGroup: 'Core', isBodyweight: true },
	{ name: 'Hanging Leg Raise', mainGroup: 'Core', isBodyweight: true },
	{ name: 'Russian Twist', mainGroup: 'Core' },
	{ name: 'Ab Wheel Rollout', mainGroup: 'Core', isBodyweight: true },
	{ name: 'Cable Woodchop', mainGroup: 'Core', secondaryGroups: ['Shoulders'] },
];
