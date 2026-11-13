export type UserRole = 'CAPTAIN' | 'MEMBER';

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  role: UserRole;
  discordRoles: string[];
}

export type TrainingType = 'MIX' | 'SCRIM' | 'ASTT';
export type PeriodType = '1_week' | '2_weeks' | '1_month' | 'custom';
export type ResponseStatus = 'DISPONIBLE' | 'INCERTAIN' | 'INDISPONIBLE';
export type SlotStatus = 'BELOW_MIN' | 'MIN_REACHED' | 'FULL' | 'EXCEEDED';

export interface TimeSlot {
  id: string;
  dateStr: string; // YYYY-MM-DD
  dayName: string; // Lundi, Mardi...
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  disponibles: string[]; // user ids
  incertains: string[];
  indisponibles: string[];
  selectedIds: string[]; // titulaires choisis par le capitaine
  waitlistIds: string[]; // liste d'attente
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
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  slots: TimeSlot[];
}
