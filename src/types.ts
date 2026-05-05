/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Status = 'upcoming' | 'mastered' | 'failed';
export type TopicPriority = 'low' | 'normal' | 'emergency';

export interface UserProfile {
  userId: string;
  email: string;
  streak: number;
  credits?: number;
  purchasedThemes?: string[];
  activePremiumTheme?: string;
  lastClaimedDaily?: string;
  lastClaimedWeekly?: string;
  lastClaimedMonthly?: string;
  lastClaimedPetQuest?: string;
  petFood?: number;
  petWater?: number;
  myPets?: any[];
  activePet?: any;
  lastPetDecayDate?: string;
  lastStreakDate?: string; // Tracks the last date a block was completed
  petHappiness?: number; // 0 to 100
  timezone?: string;
  lastActiveDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Topic {
  id: string; // Document ID
  userId: string;
  presetId?: string;
  title: string;
  subject: string;
  notes?: string;
  priority?: TopicPriority;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  masteryLevel: number;
  failedAttempts?: number;
  lastReviewed?: string; // ISO string
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleBlock {
  id: string; // Document ID
  userId: string;
  topicId: string;
  title: string;
  day: string; // 'Monday', 'Tuesday', etc.
  startTime: string; // '14:00'
  endTime: string; // '16:00'
  status: Status;
  isReview?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizLog {
  id: string; // Document ID
  userId: string;
  topicId: string;
  blockId: string;
  question: string;
  userAnswer: string;
  isCorrect: boolean;
  createdAt?: string;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const STUDY_HOURS = {
  start: 0,
  end: 23
};

export const PRESET_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'History', 'Geography', 'Economics', 'Computer Science', 'Literature', 'Custom'];
