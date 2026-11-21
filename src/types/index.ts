export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  isAdmin: boolean;
  discordRoles: string[];
}

export type TrainingType = 'MIX' | 'SCRIM' | 'ASTT' | 'ENTRAINEMENT';

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  MIX: 'MIX',
  SCRIM: 'SCRIM',
  ASTT: 'ASTT',
  ENTRAINEMENT: 'Entraînement',
};

export type PeriodType = '1_week' | '2_weeks' | '1_month' | 'custom';
export type ResponseStatus = 'DISPONIBLE' | 'INCERTAIN' | 'INDISPONIBLE';
export type SlotStatus = 'BELOW_MIN' | 'MIN_REACHED' | 'FULL' | 'EXCEEDED';

export interface TimeSlot {
  id: string;
  dateStr: string; // YYYY-MM-DD
  dayName: string; // Lundi, Mardi...
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  minParticipants?: number;
  maxParticipants?: number;
  disponibles: string[]; // user ids
  incertains: string[];
  indisponibles: string[];
  selectedIds: string[]; // titulaires choisis par l'organisateur
  waitlistIds: string[]; // liste d'attente
  teamAssignments?: Record<string, 'A' | 'B'>;
  cancelled?: boolean;
  cancelReason?: string;
}

export interface Poll {
  id: string;
  title: string;
  type: TrainingType;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  deadline: string; // ISO or formatted
  minParticipants: number;
  maxParticipants: number;
  discordChannel: string;
  targetRoles: string[];
  targetUsers: string[];
  excludedUsers: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: number;
  desiredGamesByUser: Record<string, number | null>;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  slots: TimeSlot[];
}

export interface GuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

export interface GuildMember {
  discordId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  roleIds: string[];
  roleNames: string[];
  isAdmin: boolean;
}

export interface SlotProfileDay {
  dayName: string;
  active: boolean;
  slots: Array<{
    startTime: string;
    endTime: string;
    minParticipants?: number;
    maxParticipants?: number;
  }>;
}

export interface SlotProfile {
  id: string;
  name: string;
  createdBy: string;
  createdByName: string;
  days: SlotProfileDay[];
  trainingType?: TrainingType;
  minParticipants?: number;
  maxParticipants?: number;
}
