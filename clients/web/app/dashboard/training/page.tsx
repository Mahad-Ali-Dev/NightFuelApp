'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import {
    Dumbbell, Lock, Check, ChevronLeft, ChevronRight, Play,
    Calendar, Trophy, Flame, Target, Clock, Zap,
    ArrowRight, RotateCcw, Layers, Sparkles, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { startWorkoutSession } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface WorkoutPlan {
    id: string;
    name: string;
    duration: number;
    heroGradient: string;
    heroIcon: React.ReactNode;
    accentColor: string;
    days: PlanDay[];
}

interface PlanDay {
    day: number;
    label: string;
    muscleGroup: string;
    isRest: boolean;
    exercises: string[];
}

interface WorkoutTemplate {
    id: string;
    title: string;
    muscleGroup: string;
    exerciseCount: number;
    icon: React.ReactNode;
    accentColor: string;
    accentBg: string;
    exercises: { name: string; sets: number; reps: string }[];
}

interface PlanProgress {
    planId: string;
    currentDay: number;
    completedDays: number[];
    startDate: string;
}

// ─── Mock Data: Workout Plans ───────────────────────────────────────────────────

const WORKOUT_PLANS: WorkoutPlan[] = [
    {
        id: 'muscle-building-30',
        name: 'Muscle Building',
        duration: 30,
        heroGradient: 'from-orange-600/30 via-red-600/20 to-transparent',
        heroIcon: <Flame size={48} className="text-orange-400/30" />,
        accentColor: 'text-orange-400',
        days: [
            { day: 1, label: 'Day 1', muscleGroup: 'Chest', isRest: false, exercises: ['Bench Press', 'Incline Dumbbell Press', 'Cable Flyes', 'Push-Ups', 'Dips'] },
            { day: 2, label: 'Day 2', muscleGroup: 'Back', isRest: false, exercises: ['Deadlifts', 'Barbell Rows', 'Lat Pulldowns', 'Seated Cable Rows', 'Face Pulls'] },
            { day: 3, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 4, label: 'Day 3', muscleGroup: 'Lower Body', isRest: false, exercises: ['Squats', 'Leg Press', 'Romanian Deadlifts', 'Leg Curls', 'Calf Raises'] },
            { day: 5, label: 'Day 4', muscleGroup: 'Shoulders', isRest: false, exercises: ['Overhead Press', 'Lateral Raises', 'Front Raises', 'Reverse Flyes', 'Shrugs'] },
            { day: 6, label: 'Day 5', muscleGroup: 'Arms', isRest: false, exercises: ['Barbell Curls', 'Tricep Pushdowns', 'Hammer Curls', 'Skull Crushers', 'Concentration Curls'] },
            { day: 7, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 8, label: 'Day 6', muscleGroup: 'Chest & Triceps', isRest: false, exercises: ['Incline Bench Press', 'Dumbbell Flyes', 'Cable Crossovers', 'Overhead Tricep Extension', 'Dips'] },
            { day: 9, label: 'Day 7', muscleGroup: 'Back & Biceps', isRest: false, exercises: ['Pull-Ups', 'T-Bar Rows', 'Cable Pullovers', 'EZ Bar Curls', 'Reverse Curls'] },
            { day: 10, label: 'Day 8', muscleGroup: 'Legs & Glutes', isRest: false, exercises: ['Front Squats', 'Walking Lunges', 'Hip Thrusts', 'Leg Extensions', 'Seated Calf Raises'] },
            { day: 11, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 12, label: 'Day 9', muscleGroup: 'Push Day', isRest: false, exercises: ['Flat Bench Press', 'Arnold Press', 'Incline Flyes', 'Lateral Raises', 'Tricep Dips'] },
            { day: 13, label: 'Day 10', muscleGroup: 'Pull Day', isRest: false, exercises: ['Barbell Rows', 'Lat Pulldowns', 'Face Pulls', 'Hammer Curls', 'Rear Delt Flyes'] },
            { day: 14, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 15, label: 'Day 11', muscleGroup: 'Lower Body', isRest: false, exercises: ['Hack Squats', 'Sumo Deadlifts', 'Bulgarian Split Squats', 'Leg Press', 'Standing Calf Raises'] },
            { day: 16, label: 'Day 12', muscleGroup: 'Chest', isRest: false, exercises: ['Decline Bench Press', 'Cable Flyes', 'Pec Deck', 'Push-Up Variations', 'Dumbbell Pullover'] },
            { day: 17, label: 'Day 13', muscleGroup: 'Back', isRest: false, exercises: ['Pendlay Rows', 'Chin-Ups', 'Straight Arm Pulldowns', 'Single Arm Rows', 'Hyperextensions'] },
            { day: 18, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 19, label: 'Day 14', muscleGroup: 'Shoulders & Arms', isRest: false, exercises: ['Military Press', 'Cable Lateral Raises', 'Preacher Curls', 'Rope Pushdowns', 'Wrist Curls'] },
            { day: 20, label: 'Day 15', muscleGroup: 'Full Body', isRest: false, exercises: ['Clean & Press', 'Deadlifts', 'Front Squats', 'Pull-Ups', 'Dips'] },
            { day: 21, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 22, label: 'Day 16', muscleGroup: 'Chest & Back', isRest: false, exercises: ['Bench Press', 'Barbell Rows', 'Incline Press', 'Lat Pulldowns', 'Cable Crossovers'] },
            { day: 23, label: 'Day 17', muscleGroup: 'Legs', isRest: false, exercises: ['Squats', 'Leg Curls', 'Leg Extensions', 'Step-Ups', 'Calf Raises'] },
            { day: 24, label: 'Day 18', muscleGroup: 'Arms', isRest: false, exercises: ['Barbell Curls', 'Close-Grip Bench', 'Incline Curls', 'Overhead Tricep Ext.', 'Reverse Curls'] },
            { day: 25, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 26, label: 'Day 19', muscleGroup: 'Push Day', isRest: false, exercises: ['Overhead Press', 'Incline DB Press', 'Lateral Raises', 'Tricep Kickbacks', 'Diamond Push-Ups'] },
            { day: 27, label: 'Day 20', muscleGroup: 'Pull Day', isRest: false, exercises: ['Weighted Pull-Ups', 'Meadows Rows', 'Face Pulls', 'Spider Curls', 'Shrugs'] },
            { day: 28, label: 'Day 21', muscleGroup: 'Legs & Core', isRest: false, exercises: ['Front Squats', 'RDLs', 'Hanging Leg Raises', 'Planks', 'Calf Raises'] },
            { day: 29, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 30, label: 'Day 22', muscleGroup: 'Full Body Test', isRest: false, exercises: ['Bench Press Max', 'Squat Max', 'Deadlift Max', 'Pull-Up Max', 'Plank Hold'] },
        ],
    },
    {
        id: 'muscle-stamina-30',
        name: 'Build Muscle Stamina',
        duration: 30,
        heroGradient: 'from-blue-600/30 via-cyan-600/20 to-transparent',
        heroIcon: <Zap size={48} className="text-blue-400/30" />,
        accentColor: 'text-blue-400',
        days: [
            { day: 1, label: 'Day 1', muscleGroup: 'Upper Body Circuit', isRest: false, exercises: ['Push-Ups (3x20)', 'Rows (3x15)', 'Overhead Press (3x15)', 'Curls (3x15)', 'Dips (3x15)'] },
            { day: 2, label: 'Day 2', muscleGroup: 'Lower Body Circuit', isRest: false, exercises: ['Squats (3x20)', 'Lunges (3x15)', 'Leg Press (3x15)', 'Calf Raises (3x20)', 'Wall Sit (60s)'] },
            { day: 3, label: 'Day 3', muscleGroup: 'Cardio & Core', isRest: false, exercises: ['30 Min Run', 'Planks (3x60s)', 'Mountain Climbers (3x30)', 'Russian Twists (3x20)', 'Bicycle Crunches (3x20)'] },
            { day: 4, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 5, label: 'Day 4', muscleGroup: 'Push Endurance', isRest: false, exercises: ['Bench Press (4x15)', 'DB Shoulder Press (4x15)', 'Incline Flyes (3x15)', 'Tricep Pushdowns (4x15)', 'Diamond Push-Ups (3xMax)'] },
            { day: 6, label: 'Day 5', muscleGroup: 'Pull Endurance', isRest: false, exercises: ['Lat Pulldowns (4x15)', 'Cable Rows (4x15)', 'Face Pulls (3x20)', 'Barbell Curls (4x15)', 'Hammer Curls (3x15)'] },
            { day: 7, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 8, label: 'Day 6', muscleGroup: 'Leg Endurance', isRest: false, exercises: ['Goblet Squats (4x20)', 'Walking Lunges (3x20)', 'Step-Ups (3x15)', 'Leg Curls (4x15)', 'Jump Squats (3x15)'] },
            { day: 9, label: 'Day 7', muscleGroup: 'Full Body HIIT', isRest: false, exercises: ['Burpees (4x15)', 'Kettlebell Swings (4x20)', 'Box Jumps (3x12)', 'Battle Ropes (3x30s)', 'Plank Jacks (3x20)'] },
            { day: 10, label: 'Day 8', muscleGroup: 'Upper Body', isRest: false, exercises: ['Pull-Ups (4xMax)', 'Push-Ups (4x25)', 'Rows (4x15)', 'Shoulder Press (4x15)', 'Plank Hold (3x45s)'] },
            { day: 11, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 12, label: 'Day 9', muscleGroup: 'Lower Body Power', isRest: false, exercises: ['Squats (5x12)', 'Romanian DL (4x12)', 'Leg Press (4x15)', 'Calf Raises (4x20)', 'Box Jumps (3x10)'] },
            { day: 13, label: 'Day 10', muscleGroup: 'Metabolic Conditioning', isRest: false, exercises: ['Thrusters (4x12)', 'Rowing Machine (500m x4)', 'KB Swings (4x15)', 'Burpees (3x12)', 'Mountain Climbers (3x30)'] },
            { day: 14, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 15, label: 'Day 11', muscleGroup: 'Push Circuit', isRest: false, exercises: ['Bench Press (4x12)', 'OHP (4x12)', 'Incline DB Press (3x15)', 'Cable Flyes (3x15)', 'Dips (3xMax)'] },
            { day: 16, label: 'Day 12', muscleGroup: 'Pull Circuit', isRest: false, exercises: ['Weighted Pull-Ups (4x8)', 'T-Bar Rows (4x12)', 'Face Pulls (4x15)', 'Barbell Curls (3x12)', 'Reverse Flyes (3x15)'] },
            { day: 17, label: 'Day 13', muscleGroup: 'Legs & Plyos', isRest: false, exercises: ['Front Squats (4x12)', 'Split Squats (3x12)', 'Depth Jumps (3x8)', 'Leg Curls (4x12)', 'Sprint Intervals (6x30s)'] },
            { day: 18, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 19, label: 'Day 14', muscleGroup: 'Upper Body Supersets', isRest: false, exercises: ['Bench + Rows (4x10)', 'OHP + Pulldowns (4x10)', 'Curls + Pushdowns (3x12)', 'Lateral Raises + Face Pulls (3x15)', 'Push-Ups + Inverted Rows (3xMax)'] },
            { day: 20, label: 'Day 15', muscleGroup: 'Full Body Complex', isRest: false, exercises: ['Clean & Press (5x5)', 'Deadlifts (4x8)', 'Front Squats (4x10)', 'Pull-Ups (4xMax)', 'Farmer Walks (3x40m)'] },
            { day: 21, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 22, label: 'Day 16', muscleGroup: 'Push Strength', isRest: false, exercises: ['Bench Press (5x5)', 'Weighted Dips (4x8)', 'Arnold Press (4x10)', 'Cable Crossovers (3x15)', 'Close-Grip Bench (3x10)'] },
            { day: 23, label: 'Day 17', muscleGroup: 'Pull Strength', isRest: false, exercises: ['Barbell Rows (5x5)', 'Weighted Chin-Ups (4x6)', 'Meadows Rows (3x10)', 'Preacher Curls (3x12)', 'Shrugs (4x12)'] },
            { day: 24, label: 'Day 18', muscleGroup: 'Leg Strength', isRest: false, exercises: ['Back Squats (5x5)', 'Sumo Deadlifts (4x6)', 'Hack Squats (3x10)', 'Leg Extensions (3x15)', 'Standing Calf Raises (4x15)'] },
            { day: 25, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 26, label: 'Day 19', muscleGroup: 'Conditioning', isRest: false, exercises: ['Assault Bike (10x30s)', 'KB Swings (5x15)', 'Battle Ropes (5x30s)', 'Box Jumps (4x10)', 'Burpees (4x10)'] },
            { day: 27, label: 'Day 20', muscleGroup: 'Upper Hypertrophy', isRest: false, exercises: ['Incline DB Press (4x12)', 'Cable Rows (4x12)', 'Lateral Raises (4x15)', 'Hammer Curls (3x12)', 'Overhead Ext. (3x12)'] },
            { day: 28, label: 'Day 21', muscleGroup: 'Lower Hypertrophy', isRest: false, exercises: ['Leg Press (4x15)', 'Walking Lunges (3x20)', 'RDLs (4x12)', 'Leg Curls (3x15)', 'Seated Calf Raises (4x20)'] },
            { day: 29, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 30, label: 'Day 22', muscleGroup: 'Final Assessment', isRest: false, exercises: ['Max Push-Ups (2min)', 'Max Pull-Ups', '1 Mile Run', 'Max Squats (BW)', 'Plank Hold Max'] },
        ],
    },
    {
        id: 'strength-training-30',
        name: 'Strength Training',
        duration: 30,
        heroGradient: 'from-purple-600/30 via-violet-600/20 to-transparent',
        heroIcon: <Shield size={48} className="text-purple-400/30" />,
        accentColor: 'text-purple-400',
        days: [
            { day: 1, label: 'Day 1', muscleGroup: 'Squat Focus', isRest: false, exercises: ['Back Squats (5x5)', 'Pause Squats (3x3)', 'Leg Press (3x8)', 'GHRs (3x10)', 'Ab Wheel (3x10)'] },
            { day: 2, label: 'Day 2', muscleGroup: 'Bench Focus', isRest: false, exercises: ['Bench Press (5x5)', 'Close-Grip Bench (3x6)', 'DB Bench (3x8)', 'Tricep Dips (3x10)', 'Face Pulls (3x15)'] },
            { day: 3, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 4, label: 'Day 3', muscleGroup: 'Deadlift Focus', isRest: false, exercises: ['Deadlifts (5x3)', 'Deficit Deadlifts (3x5)', 'Barbell Rows (4x6)', 'Lat Pulldowns (3x10)', 'Farmer Walks (3x40m)'] },
            { day: 5, label: 'Day 4', muscleGroup: 'OHP Focus', isRest: false, exercises: ['Overhead Press (5x5)', 'Push Press (3x3)', 'DB OHP (3x8)', 'Lateral Raises (3x12)', 'Shrugs (3x10)'] },
            { day: 6, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 7, label: 'Day 5', muscleGroup: 'Accessories', isRest: false, exercises: ['Pull-Ups (5xMax)', 'Dips (5xMax)', 'Barbell Curls (3x10)', 'Skull Crushers (3x10)', 'Planks (3x60s)'] },
            { day: 8, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 9, label: 'Day 6', muscleGroup: 'Squat Volume', isRest: false, exercises: ['Front Squats (4x6)', 'Pause Squats (3x5)', 'Bulgarian Splits (3x8)', 'Leg Curls (3x12)', 'Standing Calf (4x15)'] },
            { day: 10, label: 'Day 7', muscleGroup: 'Bench Volume', isRest: false, exercises: ['Incline Bench (4x6)', 'Spoto Press (3x5)', 'DB Flyes (3x10)', 'Cable Pushdowns (3x12)', 'Band Pull-Aparts (3x20)'] },
            { day: 11, label: 'Day 8', muscleGroup: 'Deadlift Volume', isRest: false, exercises: ['Romanian DL (4x6)', 'Snatch Grip DL (3x5)', 'Pendlay Rows (4x6)', 'Pull-Ups (4x8)', 'Back Extensions (3x12)'] },
            { day: 12, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 13, label: 'Day 9', muscleGroup: 'OHP Volume', isRest: false, exercises: ['Seated OHP (4x6)', 'Z-Press (3x5)', 'Arnold Press (3x10)', 'Cable Lateral Raises (3x15)', 'Face Pulls (3x15)'] },
            { day: 14, label: 'Day 10', muscleGroup: 'Full Body Power', isRest: false, exercises: ['Power Cleans (5x3)', 'Push Press (4x5)', 'Front Squats (3x5)', 'Weighted Chins (4x5)', 'Farmer Walks (3x60m)'] },
            { day: 15, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 16, label: 'Day 11', muscleGroup: 'Squat Intensity', isRest: false, exercises: ['Back Squats (3x3 @85%)', 'Pause Squats (2x2 @80%)', 'Leg Press (3x6)', 'Walking Lunges (3x10)', 'Calf Raises (4x12)'] },
            { day: 17, label: 'Day 12', muscleGroup: 'Bench Intensity', isRest: false, exercises: ['Bench Press (3x3 @85%)', 'Floor Press (3x5)', 'Incline DB Press (3x8)', 'JM Press (3x8)', 'Chest Supported Rows (3x10)'] },
            { day: 18, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 19, label: 'Day 13', muscleGroup: 'Deadlift Intensity', isRest: false, exercises: ['Deadlifts (3x2 @87%)', 'Block Pulls (3x3)', 'Barbell Rows (4x5)', 'Lat Pulldowns (3x10)', 'Ab Wheel (3x12)'] },
            { day: 20, label: 'Day 14', muscleGroup: 'OHP Intensity', isRest: false, exercises: ['OHP (3x3 @85%)', 'Viking Press (3x5)', 'Lateral Raises (4x12)', 'Rear Delt Flyes (3x15)', 'Shrugs (4x8)'] },
            { day: 21, label: 'Rest Day', muscleGroup: 'Recovery + Deload', isRest: true, exercises: [] },
            { day: 22, label: 'Day 15', muscleGroup: 'Deload Squat', isRest: false, exercises: ['Squats (3x5 @60%)', 'Leg Press (2x10 Light)', 'Bodyweight Lunges (2x15)', 'Calf Raises (3x15)', 'Stretching (15 min)'] },
            { day: 23, label: 'Day 16', muscleGroup: 'Deload Bench', isRest: false, exercises: ['Bench Press (3x5 @60%)', 'Push-Ups (3x15)', 'DB Flyes (2x12 Light)', 'Band Pull-Aparts (3x20)', 'Stretching (15 min)'] },
            { day: 24, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 25, label: 'Day 17', muscleGroup: 'Peak Squat', isRest: false, exercises: ['Squats (Work to 1RM)', 'Pause Squats (2x2 @75%)', 'Leg Press (2x8)', 'Core Work (10 min)', 'Mobility (10 min)'] },
            { day: 26, label: 'Day 18', muscleGroup: 'Peak Bench', isRest: false, exercises: ['Bench Press (Work to 1RM)', 'Close-Grip (2x3 @75%)', 'DB Press (2x8)', 'Tricep Work (10 min)', 'Mobility (10 min)'] },
            { day: 27, label: 'Rest Day', muscleGroup: 'Recovery', isRest: true, exercises: [] },
            { day: 28, label: 'Day 19', muscleGroup: 'Peak Deadlift', isRest: false, exercises: ['Deadlifts (Work to 1RM)', 'RDLs (2x5 @70%)', 'Rows (2x8)', 'Grip Work (10 min)', 'Mobility (10 min)'] },
            { day: 29, label: 'Day 20', muscleGroup: 'Peak OHP', isRest: false, exercises: ['OHP (Work to 1RM)', 'Push Press (2x3 @75%)', 'Lateral Raises (2x12)', 'Rear Delts (2x15)', 'Mobility (10 min)'] },
            { day: 30, label: 'Day 21', muscleGroup: 'Final Testing', isRest: false, exercises: ['All Lifts 1RM Retest', 'Progress Photos', 'Measurements Update', 'Recovery Protocol', 'Program Debrief'] },
        ],
    },
];

// ─── Mock Data: Workout Templates ───────────────────────────────────────────────

const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
    {
        id: 'back-workout',
        title: 'Back Workout',
        muscleGroup: 'Back',
        exerciseCount: 5,
        icon: <Target size={20} />,
        accentColor: 'text-blue-400',
        accentBg: 'bg-blue-500/15',
        exercises: [
            { name: 'Deadlifts', sets: 4, reps: '6-8' },
            { name: 'Barbell Rows', sets: 4, reps: '8-10' },
            { name: 'Lat Pulldowns', sets: 3, reps: '10-12' },
            { name: 'Seated Cable Rows', sets: 3, reps: '10-12' },
            { name: 'Face Pulls', sets: 3, reps: '15-20' },
        ],
    },
    {
        id: 'chest-workout',
        title: 'Chest Workout',
        muscleGroup: 'Chest',
        exerciseCount: 6,
        icon: <Flame size={20} />,
        accentColor: 'text-red-400',
        accentBg: 'bg-red-500/15',
        exercises: [
            { name: 'Barbell Bench Press', sets: 4, reps: '6-8' },
            { name: 'Incline Dumbbell Press', sets: 4, reps: '8-10' },
            { name: 'Cable Crossovers', sets: 3, reps: '12-15' },
            { name: 'Dumbbell Flyes', sets: 3, reps: '10-12' },
            { name: 'Push-Ups', sets: 3, reps: 'To failure' },
            { name: 'Dips (Chest focus)', sets: 3, reps: '10-12' },
        ],
    },
    {
        id: 'full-body-workout',
        title: 'Full Body Workout',
        muscleGroup: 'Full Body',
        exerciseCount: 7,
        icon: <Zap size={20} />,
        accentColor: 'text-brand-400',
        accentBg: 'bg-brand-500/15',
        exercises: [
            { name: 'Barbell Squats', sets: 4, reps: '8-10' },
            { name: 'Bench Press', sets: 4, reps: '8-10' },
            { name: 'Barbell Rows', sets: 3, reps: '8-10' },
            { name: 'Overhead Press', sets: 3, reps: '8-10' },
            { name: 'Romanian Deadlifts', sets: 3, reps: '10-12' },
            { name: 'Pull-Ups', sets: 3, reps: 'To failure' },
            { name: 'Plank Hold', sets: 3, reps: '60s' },
        ],
    },
    {
        id: 'arm-workout',
        title: 'Arm Workout',
        muscleGroup: 'Arms',
        exerciseCount: 6,
        icon: <Dumbbell size={20} />,
        accentColor: 'text-orange-400',
        accentBg: 'bg-orange-500/15',
        exercises: [
            { name: 'Barbell Curls', sets: 4, reps: '8-10' },
            { name: 'Skull Crushers', sets: 4, reps: '8-10' },
            { name: 'Hammer Curls', sets: 3, reps: '10-12' },
            { name: 'Overhead Tricep Extension', sets: 3, reps: '10-12' },
            { name: 'Concentration Curls', sets: 3, reps: '12-15' },
            { name: 'Tricep Pushdowns', sets: 3, reps: '12-15' },
        ],
    },
    {
        id: 'abs-workout',
        title: 'Abs Workout',
        muscleGroup: 'Core',
        exerciseCount: 6,
        icon: <Layers size={20} />,
        accentColor: 'text-emerald-400',
        accentBg: 'bg-emerald-500/15',
        exercises: [
            { name: 'Hanging Leg Raises', sets: 4, reps: '12-15' },
            { name: 'Cable Crunches', sets: 3, reps: '15-20' },
            { name: 'Ab Wheel Rollouts', sets: 3, reps: '10-12' },
            { name: 'Russian Twists', sets: 3, reps: '20 each' },
            { name: 'Plank Hold', sets: 3, reps: '60s' },
            { name: 'Mountain Climbers', sets: 3, reps: '30s' },
        ],
    },
    {
        id: 'v-taper-workout',
        title: 'V-Taper Workout',
        muscleGroup: 'Back & Shoulders',
        exerciseCount: 6,
        icon: <Trophy size={20} />,
        accentColor: 'text-violet-400',
        accentBg: 'bg-violet-500/15',
        exercises: [
            { name: 'Wide-Grip Pull-Ups', sets: 4, reps: 'To failure' },
            { name: 'Lateral Raises', sets: 4, reps: '12-15' },
            { name: 'Lat Pulldowns (Wide)', sets: 4, reps: '10-12' },
            { name: 'Overhead Press', sets: 3, reps: '8-10' },
            { name: 'Cable Lateral Raises', sets: 3, reps: '15' },
            { name: 'Straight Arm Pulldowns', sets: 3, reps: '12-15' },
        ],
    },
    {
        id: 'leg-workout',
        title: 'Leg Workout',
        muscleGroup: 'Legs',
        exerciseCount: 6,
        icon: <Target size={20} />,
        accentColor: 'text-amber-400',
        accentBg: 'bg-amber-500/15',
        exercises: [
            { name: 'Barbell Squats', sets: 5, reps: '5-8' },
            { name: 'Leg Press', sets: 4, reps: '10-12' },
            { name: 'Romanian Deadlifts', sets: 4, reps: '8-10' },
            { name: 'Leg Extensions', sets: 3, reps: '12-15' },
            { name: 'Leg Curls', sets: 3, reps: '10-12' },
            { name: 'Standing Calf Raises', sets: 4, reps: '15-20' },
        ],
    },
];

// ─── localStorage Helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = 'nightfuel_training_progress';

function loadProgress(): PlanProgress | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as PlanProgress;
    } catch {
        return null;
    }
}

function saveProgress(progress: PlanProgress) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
        // silently fail
    }
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function TrainingHubPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'plan' | 'training'>('plan');
    const [activePlanIndex, setActivePlanIndex] = useState(0);
    const [progress, setProgress] = useState<PlanProgress | null>(null);
    const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
    const carouselRef = useRef<HTMLDivElement>(null);

    // Load progress from localStorage on mount
    useEffect(() => {
        const saved = loadProgress();
        if (saved) {
            setProgress(saved);
            const idx = WORKOUT_PLANS.findIndex(p => p.id === saved.planId);
            if (idx >= 0) setActivePlanIndex(idx);
        } else {
            // Default: first plan, day 1
            const defaultProgress: PlanProgress = {
                planId: WORKOUT_PLANS[0]!.id,
                currentDay: 1,
                completedDays: [],
                startDate: new Date().toISOString().split('T')[0] as string,
            };
            setProgress(defaultProgress);
            saveProgress(defaultProgress);
        }
    }, []);

    const activePlan = WORKOUT_PLANS[activePlanIndex] ?? WORKOUT_PLANS[0]!;
    const daysLeft = activePlan ? activePlan.duration - (progress?.currentDay ?? 1) + 1 : 0;

    // Select a plan from carousel
    const selectPlan = useCallback((index: number) => {
        setActivePlanIndex(index);
        const plan = WORKOUT_PLANS[index]!;
        const newProgress: PlanProgress = {
            planId: plan.id,
            currentDay: 1,
            completedDays: [],
            startDate: new Date().toISOString().split('T')[0] as string,
        };
        setProgress(newProgress);
        saveProgress(newProgress);
    }, []);

    // Start / complete a day
    const handleStartDay = async (dayNum: number) => {
        if (!progress || !activePlan) return;

        const day = activePlan.days.find(d => d.day === dayNum);
        if (!day) return;

        if (day.isRest) {
            // Just mark rest day as complete
            const updated: PlanProgress = {
                ...progress,
                completedDays: [...progress.completedDays, dayNum],
                currentDay: dayNum < activePlan.duration ? dayNum + 1 : dayNum,
            };
            setProgress(updated);
            saveProgress(updated);
            return;
        }

        // Start workout session
        try {
            const { data } = await startWorkoutSession();

            const exercises = day.exercises.map(exName => {
                let sets = 3;
                let reps = 10;
                const match = exName.match(/\((\d+)x(Max|\d+[a-zA-Z]*)\)/);
                if (match) {
                    sets = parseInt(match[1]!) || 3;
                    reps = match[2] === 'Max' ? 20 : (parseInt(match[2]!) || 10);
                }
                const cleanName = exName.replace(/\s*\([^)]+\)/, '').trim();

                return {
                    name: cleanName,
                    targetSets: sets,
                    targetReps: reps,
                    muscleGroup: day.muscleGroup,
                };
            });

            const workoutData = {
                planName: activePlan.name,
                dayNumber: day.day,
                dayName: day.label,
                sessionId: data.id,
                exercises,
            };

            localStorage.setItem('nf_active_workout', JSON.stringify(workoutData));
            localStorage.removeItem('nf_active_workout_state');
            router.push('/dashboard/training/workout');
        } catch (error) {
            console.error('Failed to start session:', error);
            alert('Failed to start workout session. Please try again.');
        }
    };

    // Reset plan
    const handleResetPlan = useCallback(() => {
        const newProgress: PlanProgress = {
            planId: activePlan?.id ?? 'muscle_building',
            currentDay: 1,
            completedDays: [],
            startDate: new Date().toISOString().split('T')[0] as string,
        };
        setProgress(newProgress);
        saveProgress(newProgress);
    }, [activePlan]);

    // Carousel navigation
    const scrollCarousel = useCallback((direction: 'left' | 'right') => {
        if (direction === 'left') {
            setActivePlanIndex(prev => Math.max(0, prev - 1));
        } else {
            setActivePlanIndex(prev => Math.min(WORKOUT_PLANS.length - 1, prev + 1));
        }
    }, []);

    // Toggle template expansion
    const toggleTemplate = useCallback((id: string) => {
        setExpandedTemplates(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // Start workout from a template
    const handleStartTemplate = async (template: WorkoutTemplate) => {
        try {
            // Inform the backend we are starting a session based on this routine
            // For now, template.id is the routine string (we will mock routine ID for now since routines are static in frontend)
            const { data } = await startWorkoutSession(); // We omitted passing routineId if we don't have it explicitly created in DB yet

            // Build the workout state logic
            const workoutData = {
                planName: template.title,
                dayNumber: 1,
                dayName: template.muscleGroup,
                sessionId: data.id, // Store the real backend session ID!
                exercises: template.exercises.map(ex => ({
                    name: ex.name,
                    targetSets: ex.sets,
                    targetReps: parseInt(ex.reps) || 8,
                    muscleGroup: template.muscleGroup,
                })),
            };
            localStorage.setItem('nf_active_workout', JSON.stringify(workoutData));
            localStorage.removeItem('nf_active_workout_state');
            router.push('/dashboard/training/workout');
        } catch (error) {
            console.error('Failed to start session:', error);
            alert('Failed to start workout session. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-transparent">
            {/* Ambient blobs */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-0 w-[60%] h-[40%] bg-brand-500/8 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-0 w-[50%] h-[40%] bg-blue-500/8 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6">
                {/* ── Page Header ─────────────────────────────────────────────── */}
                <motion.header
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
                            <span className="p-2.5 rounded-xl bg-brand-500/20">
                                <Dumbbell size={22} className="text-brand-400" />
                            </span>
                            Training Hub
                        </h1>
                        <p className="text-neutral-500 text-sm mt-1 ml-1">Build strength. Build discipline.</p>
                    </div>
                </motion.header>

                {/* ── Tab Switcher ────────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="flex gap-1 bg-white/[0.04] border border-white/[0.06] rounded-2xl p-1.5"
                >
                    {(['plan', 'training'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                'relative flex-1 py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-widest transition-all duration-200',
                                activeTab === tab
                                    ? 'text-white'
                                    : 'text-zinc-400 hover:text-zinc-200'
                            )}
                        >
                            {activeTab === tab && (
                                <motion.div
                                    layoutId="tab-active-bg"
                                    className="absolute inset-0 bg-brand-500/20 border border-brand-500/30 rounded-xl"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {tab === 'plan' ? <Calendar size={16} /> : <Dumbbell size={16} />}
                                {tab}
                            </span>
                            {activeTab === tab && (
                                <motion.div
                                    layoutId="tab-underline"
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-500 rounded-full"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            )}
                        </button>
                    ))}
                </motion.div>

                {/* ── Tab Content ─────────────────────────────────────────────── */}
                <AnimatePresence mode="wait">
                    {activeTab === 'plan' ? (
                        <motion.div
                            key="plan-tab"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-6"
                        >
                            {/* Plan Carousel */}
                            <PlanCarousel
                                plans={WORKOUT_PLANS}
                                activeIndex={activePlanIndex}
                                onSelect={selectPlan}
                                onScroll={scrollCarousel}
                                daysLeft={daysLeft}
                                progress={progress}
                            />

                            {/* Reset button */}
                            {progress && progress.completedDays.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex justify-end"
                                >
                                    <button
                                        onClick={handleResetPlan}
                                        className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-red-400 transition-colors px-3 py-2 rounded-xl hover:bg-red-500/10"
                                    >
                                        <RotateCcw size={14} />
                                        Reset Plan
                                    </button>
                                </motion.div>
                            )}

                            {/* Day-by-Day List */}
                            <DayList
                                plan={activePlan}
                                progress={progress}
                                onStartDay={handleStartDay}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="training-tab"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-4"
                        >
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
                                Pre-built Workout Templates
                            </p>
                            {WORKOUT_TEMPLATES.map((template, idx) => (
                                <TemplateCard
                                    key={template.id}
                                    template={template}
                                    index={idx}
                                    expanded={expandedTemplates.has(template.id)}
                                    onToggle={() => toggleTemplate(template.id)}
                                    onStart={() => handleStartTemplate(template)}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─── Plan Carousel ──────────────────────────────────────────────────────────────

function PlanCarousel({
    plans,
    activeIndex,
    onSelect,
    onScroll,
    daysLeft,
    progress,
}: {
    plans: WorkoutPlan[];
    activeIndex: number;
    onSelect: (index: number) => void;
    onScroll: (dir: 'left' | 'right') => void;
    daysLeft: number;
    progress: PlanProgress | null;
}) {
    return (
        <div className="space-y-4">
            {/* Carousel with nav arrows */}
            <div className="relative">
                {/* Left arrow */}
                {activeIndex > 0 && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => onScroll('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white hover:bg-white/10 transition-all -ml-2 md:-ml-4"
                    >
                        <ChevronLeft size={18} />
                    </motion.button>
                )}

                {/* Right arrow */}
                {activeIndex < plans.length - 1 && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => onScroll('right')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white hover:bg-white/10 transition-all -mr-2 md:-mr-4"
                    >
                        <ChevronRight size={18} />
                    </motion.button>
                )}

                {/* Cards container */}
                <div className="overflow-hidden rounded-2xl">
                    <motion.div
                        className="flex"
                        animate={{ x: `${-activeIndex * 100}%` }}
                        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
                    >
                        {plans.map((plan, idx) => {
                            const isActive = idx === activeIndex;
                            const completedCount = progress?.planId === plan.id ? progress.completedDays.length : 0;
                            const progressPercent = Math.round((completedCount / plan.duration) * 100);

                            return (
                                <div
                                    key={plan.id}
                                    className="w-full flex-shrink-0 px-1"
                                >
                                    <motion.div
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => onSelect(idx)}
                                        className={cn(
                                            'relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-300',
                                            'bg-white/[0.05] backdrop-blur border-white/[0.1]',
                                            isActive && 'ring-2 ring-brand-500/50 border-brand-500/30'
                                        )}
                                    >
                                        {/* Hero gradient */}
                                        <div className={cn(
                                            'absolute inset-0 bg-gradient-to-br opacity-60',
                                            plan.heroGradient
                                        )} />

                                        {/* Hero icon */}
                                        <div className="absolute top-4 right-4">
                                            {plan.heroIcon}
                                        </div>

                                        {/* Content */}
                                        <div className="relative z-10 p-6">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className={cn(
                                                    'text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border',
                                                    plan.accentColor,
                                                    'bg-white/5 border-white/10'
                                                )}>
                                                    {plan.duration} Days
                                                </span>
                                                {progress?.planId === plan.id && (
                                                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-brand-500/20 border border-brand-500/30 text-brand-400">
                                                        Active
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="text-xl md:text-2xl font-black text-white mb-1">
                                                {plan.name}
                                            </h3>
                                            <p className="text-sm text-neutral-400 mb-4">
                                                {plan.duration} Day Program
                                            </p>

                                            {/* Progress bar */}
                                            {progress?.planId === plan.id && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-neutral-500 font-medium">
                                                            {completedCount} of {plan.duration} days completed
                                                        </span>
                                                        <span className={cn('font-bold', plan.accentColor)}>
                                                            {daysLeft} days left
                                                        </span>
                                                    </div>
                                                    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                                        <motion.div
                                                            className="h-full bg-brand-500 rounded-full"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${progressPercent}%` }}
                                                            transition={{ duration: 0.8, ease: 'easeOut' }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                </div>
                            );
                        })}
                    </motion.div>
                </div>
            </div>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-2">
                {plans.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => onSelect(idx)}
                        className={cn(
                            'transition-all duration-300 rounded-full',
                            idx === activeIndex
                                ? 'w-8 h-2 bg-brand-500'
                                : 'w-2 h-2 bg-white/20 hover:bg-white/40'
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Day List ───────────────────────────────────────────────────────────────────

function DayList({
    plan,
    progress,
    onStartDay,
}: {
    plan: WorkoutPlan;
    progress: PlanProgress | null;
    onStartDay: (day: number) => void;
}) {
    if (!plan || !progress) return null;

    const currentDay = progress.currentDay;
    const completedDays = progress.completedDays;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} className="text-brand-400" />
                    Daily Schedule
                </h3>
                <span className="text-xs text-neutral-600 font-medium">
                    Day {currentDay} of {plan.duration}
                </span>
            </div>

            {plan.days.map((day, idx) => {
                const isCompleted = completedDays.includes(day.day);
                const isCurrent = day.day === currentDay && !isCompleted;
                const isLocked = day.day > currentDay && !isCompleted;
                const isPast = day.day < currentDay && !isCompleted;

                return (
                    <motion.div
                        key={day.day}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.03, 0.6) }}
                    >
                        <div
                            className={cn(
                                'group relative overflow-hidden rounded-xl border transition-all duration-200',
                                isCurrent && 'bg-brand-500/10 border-brand-500/30 shadow-lg shadow-brand-500/10',
                                isCompleted && 'bg-emerald-500/5 border-emerald-500/20',
                                isLocked && 'bg-white/[0.02] border-white/[0.06] opacity-60',
                                isPast && 'bg-white/[0.02] border-white/[0.06] opacity-60',
                                day.isRest && !isCurrent && !isCompleted && 'bg-white/[0.02] border-white/[0.06]'
                            )}
                        >
                            {/* Active glow effect */}
                            {isCurrent && (
                                <div className="absolute inset-0 bg-gradient-to-r from-brand-500/5 via-brand-500/10 to-brand-500/5 animate-pulse" />
                            )}

                            <div className="relative z-10 flex items-center gap-4 px-4 py-3.5">
                                {/* Day Number / Status Icon */}
                                <div className={cn(
                                    'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 text-sm font-black transition-all',
                                    isCurrent && 'bg-brand-500 text-white shadow-lg shadow-brand-500/30',
                                    isCompleted && 'bg-emerald-500/20 text-emerald-400',
                                    isLocked && 'bg-white/[0.04] text-neutral-600',
                                    isPast && 'bg-white/[0.04] text-neutral-600',
                                    day.isRest && !isCurrent && !isCompleted && 'bg-white/[0.04] text-neutral-500'
                                )}>
                                    {isCompleted ? (
                                        <Check size={18} strokeWidth={3} />
                                    ) : isLocked ? (
                                        <Lock size={14} />
                                    ) : (
                                        <span>{day.day}</span>
                                    )}
                                </div>

                                {/* Day Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className={cn(
                                            'text-sm font-bold truncate',
                                            isCurrent && 'text-white',
                                            isCompleted && 'text-emerald-300',
                                            (isLocked || isPast) && 'text-neutral-500',
                                            day.isRest && !isCurrent && !isCompleted && 'text-neutral-400'
                                        )}>
                                            {day.isRest ? 'Rest Day' : `${day.label} (${day.muscleGroup})`}
                                        </h4>
                                        {day.isRest && (
                                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                                Recovery
                                            </span>
                                        )}
                                    </div>
                                    {!day.isRest && day.exercises.length > 0 && (
                                        <p className={cn(
                                            'text-xs mt-0.5 truncate',
                                            isCurrent ? 'text-brand-300/70' : 'text-neutral-600'
                                        )}>
                                            {day.exercises.slice(0, 3).join(' / ')}
                                            {day.exercises.length > 3 && ` +${day.exercises.length - 3} more`}
                                        </p>
                                    )}
                                </div>

                                {/* Action */}
                                <div className="shrink-0">
                                    {isCurrent && !day.isRest && (
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => onStartDay(day.day)}
                                            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-500/25 transition-colors"
                                        >
                                            <Play size={14} className="fill-white" />
                                            Start
                                        </motion.button>
                                    )}
                                    {isCurrent && day.isRest && (
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => onStartDay(day.day)}
                                            className="flex items-center gap-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs font-bold px-4 py-2.5 rounded-xl border border-violet-500/20 transition-colors"
                                        >
                                            <Check size={14} />
                                            Done
                                        </motion.button>
                                    )}
                                    {isCompleted && (
                                        <div className="flex items-center gap-1.5 text-emerald-400">
                                            <Check size={16} strokeWidth={3} />
                                            <span className="text-xs font-bold">Done</span>
                                        </div>
                                    )}
                                    {isLocked && (
                                        <Lock size={16} className="text-neutral-700" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}

// ─── Template Card ──────────────────────────────────────────────────────────────

function TemplateCard({
    template,
    index,
    expanded,
    onToggle,
    onStart,
}: {
    template: WorkoutTemplate;
    index: number;
    expanded: boolean;
    onToggle: () => void;
    onStart: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.06, 0.4) }}
        >
            <div className={cn(
                'bg-white/[0.05] backdrop-blur border border-white/[0.1] rounded-2xl overflow-hidden transition-all duration-200 hover:border-white/20 hover:bg-white/[0.07]',
                expanded && 'border-white/20'
            )}>
                {/* Header */}
                <button
                    onClick={onToggle}
                    className="w-full flex items-center gap-4 p-4 text-left"
                >
                    <div className={cn(
                        'flex items-center justify-center w-11 h-11 rounded-xl shrink-0',
                        template.accentBg
                    )}>
                        <span className={template.accentColor}>{template.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-sm">{template.title}</h3>
                        <div className="flex items-center gap-3 mt-0.5">
                            <span className={cn('text-[10px] font-bold uppercase tracking-wider', template.accentColor)}>
                                {template.muscleGroup}
                            </span>
                            <span className="text-[10px] text-neutral-600 font-medium">
                                {template.exerciseCount} exercises
                            </span>
                        </div>
                    </div>

                    {/* Preview badges (when collapsed) */}
                    {!expanded && (
                        <div className="hidden md:flex items-center gap-2 shrink-0">
                            {template.exercises.slice(0, 3).map((ex, i) => (
                                <span
                                    key={i}
                                    className="text-[10px] text-neutral-500 bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-lg font-medium truncate max-w-[100px]"
                                >
                                    {ex.sets}x{ex.reps}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className={cn(
                        'shrink-0 text-neutral-500 transition-transform duration-200',
                        expanded && 'rotate-90'
                    )}>
                        <ChevronRight size={18} />
                    </div>
                </button>

                {/* Expanded Content */}
                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                        >
                            <div className="px-4 pb-4 pt-1">
                                <div className="bg-black/20 rounded-xl border border-white/[0.05] overflow-hidden">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-white/[0.05] bg-white/[0.03]">
                                                <th className="px-4 py-2.5 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                                    Exercise
                                                </th>
                                                <th className="px-4 py-2.5 font-semibold text-neutral-400 uppercase tracking-wider text-[10px] text-center">
                                                    Sets
                                                </th>
                                                <th className="px-4 py-2.5 font-semibold text-neutral-400 uppercase tracking-wider text-[10px] text-center">
                                                    Reps
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {template.exercises.map((ex, i) => (
                                                <tr
                                                    key={i}
                                                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors"
                                                >
                                                    <td className="px-4 py-2.5 text-white font-medium text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', template.accentBg.replace('/15', ''))} />
                                                            {ex.name}
                                                        </div>
                                                    </td>
                                                    <td className={cn('px-4 py-2.5 text-center font-bold', template.accentColor)}>
                                                        {ex.sets}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center text-neutral-300 font-medium">
                                                        {ex.reps}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Start Workout button */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onStart}
                                    className="w-full mt-3 flex items-center justify-center gap-2 bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/20 text-brand-400 text-sm font-bold py-3 rounded-xl transition-colors"
                                >
                                    <Play size={16} className="fill-current" />
                                    Start Workout
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
