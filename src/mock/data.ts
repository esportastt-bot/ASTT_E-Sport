import type { UserProfile, Poll } from '../types';

export const MOCK_USERS: UserProfile[] = [
  { id: 'usr_cap', name: 'Alex (Capitaine)', avatar: '👑', role: 'CAPTAIN', discordRoles: ['Capitaine', 'Joueur ASTT'] },
  { id: 'usr_1', name: 'Thomas', avatar: '🎮', role: 'MEMBER', discordRoles: ['Joueur ASTT'] },
  { id: 'usr_2', name: 'Maxime', avatar: '🎯', role: 'MEMBER', discordRoles: ['Joueur ASTT'] },
  { id: 'usr_3', name: 'Lucas', avatar: '⚡', role: 'MEMBER', discordRoles: ['Joueur ASTT'] },
  { id: 'usr_4', name: 'Sarah', avatar: '🚀', role: 'MEMBER', discordRoles: ['Joueur ASTT'] },
  { id: 'usr_5', name: 'Nicolas', avatar: '🔥', role: 'MEMBER', discordRoles: ['Joueur ASTT'] },
  { id: 'usr_6', name: 'Julien', avatar: '🛡️', role: 'MEMBER', discordRoles: ['Joueur ASTT'] },
  { id: 'usr_7', name: 'Camille', avatar: '🌟', role: 'MEMBER', discordRoles: ['Joueur ASTT'] },
  { id: 'usr_8', name: 'Antoine', avatar: '🕹️', role: 'MEMBER', discordRoles: ['Remplaçant'] },
];

export const MOCK_POLL: Poll = {
  id: 'poll-2026-w46',
  title: 'Entraînements Semaine 47 - Prépa Tournoi',
  type: 'ASTT',
  periodType: '1_week',
  startDate: '2026-11-16',
  endDate: '2026-11-22',
  deadline: '2026-11-15T20:00:00',
  minParticipants: 4,
  maxParticipants: 8,
  discordChannel: '#annonces-matchs',
  targetRoles: ['Joueur ASTT'],
  targetUsers: [],
  excludedUsers: [],
  status: 'OPEN',
  slots: [
    {
      id: 'slot-1',
      dateStr: '2026-11-16',
      dayName: 'Lundi',
      startTime: '20:30',
      endTime: '21:50',
      disponibles: ['usr_cap', 'usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6', 'usr_7', 'usr_8'], // 9 dispo -> EXCEEDED !
      incertains: [],
      indisponibles: [],
      selectedIds: ['usr_cap', 'usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6', 'usr_7'],
      waitlistIds: ['usr_8'],
    },
    {
      id: 'slot-2',
      dateStr: '2026-11-17',
      dayName: 'Mardi',
      startTime: '20:30',
      endTime: '21:50',
      disponibles: ['usr_cap', 'usr_1', 'usr_3', 'usr_5'], // 4 dispo -> MIN_REACHED
      incertains: ['usr_2', 'usr_7'],
      indisponibles: ['usr_4'],
      selectedIds: ['usr_cap', 'usr_1', 'usr_3', 'usr_5'],
      waitlistIds: [],
    },
    {
      id: 'slot-3',
      dateStr: '2026-11-18',
      dayName: 'Mercredi',
      startTime: '20:30',
      endTime: '21:50',
      disponibles: ['usr_cap', 'usr_4'], // 2 dispo -> BELOW_MIN
      incertains: ['usr_1'],
      indisponibles: ['usr_2', 'usr_3', 'usr_5'],
      selectedIds: [],
      waitlistIds: [],
    },
    {
      id: 'slot-4',
      dateStr: '2026-11-19',
      dayName: 'Jeudi',
      startTime: '20:30',
      endTime: '21:50',
      disponibles: ['usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6'], // 6 dispo -> VALIDATED
      incertains: ['usr_7'],
      indisponibles: ['usr_cap'],
      selectedIds: ['usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6'],
      waitlistIds: [],
    },
    {
      id: 'slot-5',
      dateStr: '2026-11-20',
      dayName: 'Vendredi',
      startTime: '21:00',
      endTime: '22:20',
      disponibles: ['usr_cap', 'usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6', 'usr_7'], // 8 dispo -> FULL
      incertains: [],
      indisponibles: [],
      selectedIds: ['usr_cap', 'usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6', 'usr_7'],
      waitlistIds: [],
    },
  ],
};
