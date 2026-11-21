import type { UserProfile, Poll } from '../types';

export const MOCK_USERS: UserProfile[] = [
  { id: 'usr_cap', name: 'Alex', avatar: '👑', isAdmin: true, discordRoles: ['Admin', 'Membre'] },
  { id: 'usr_1', name: 'Thomas', avatar: '🎮', isAdmin: false, discordRoles: ['Membre'] },
  { id: 'usr_2', name: 'Maxime', avatar: '🎯', isAdmin: false, discordRoles: ['Membre'] },
];

export const MOCK_POLL: Poll = {
  id: 'poll-demo',
  title: 'Entraînements Semaine 47 (du 16/11 au 22/11)',
  type: 'ASTT',
  periodType: '1_week',
  startDate: '2026-11-16',
  endDate: '2026-11-22',
  deadline: '2026-11-15T20:00:00',
  minParticipants: 4,
  maxParticipants: 8,
  discordChannel: '',
  targetRoles: ['Membre'],
  targetUsers: [],
  excludedUsers: [],
  createdBy: 'usr_cap',
  createdByName: 'Alex',
  desiredGamesByUser: {},
  status: 'OPEN',
  slots: [],
};
