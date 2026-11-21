import type { Poll } from '../types';

export interface ProposedSlotPlan {
  slotId: string;
  selectedIds: string[];
  waitlistIds: string[];
  teamAssignments: Record<string, 'A' | 'B'>;
  reachedMin: boolean;
  reason: string;
}

export interface ScheduleOptimizationResult {
  slotProposals: Record<string, ProposedSlotPlan>;
  assignedInPoll: Record<string, number>;
  summary: {
    plannedSessionsCount: number;
    viableSlotsCount: number;
    satisfiedPlayersCount: number;
    totalRequestingPlayers: number;
    unfulfilledPlayers: Array<{ userId: string; desired: number; assigned: number }>;
  };
}

/**
 * Calcule le nombre de parties déjà attribuées à chaque membre
 * dans les autres sondages du même mois (hors créneaux annulés).
 */
export function computeMonthlyAssignedCounts(
  allPolls: Poll[],
  currentPoll: Poll
): Record<string, number> {
  const counts: Record<string, number> = {};

  const months = new Set<string>();
  for (const s of currentPoll.slots) {
    if (s.dateStr && s.dateStr.length >= 7) {
      months.add(s.dateStr.slice(0, 7));
    }
  }
  if (months.size === 0 && currentPoll.startDate?.length >= 7) {
    months.add(currentPoll.startDate.slice(0, 7));
  }

  for (const poll of allPolls) {
    if (poll.id === currentPoll.id || poll.status === 'CANCELLED') continue;
    for (const slot of poll.slots) {
      if (slot.cancelled) continue;
      if (slot.dateStr && months.size > 0 && !months.has(slot.dateStr.slice(0, 7))) {
        continue;
      }
      for (const uid of slot.selectedIds) {
        counts[uid] = (counts[uid] || 0) + 1;
      }
    }
  }

  return counts;
}

/**
 * Répartit équitablement une liste de joueurs sélectionnés en Équipe A / Équipe B.
 */
export function splitIntoBalancedTeams(selectedIds: string[]): Record<string, 'A' | 'B'> {
  const assignments: Record<string, 'A' | 'B'> = {};
  selectedIds.forEach((uid, index) => {
    assignments[uid] = index % 2 === 0 ? 'A' : 'B';
  });
  return assignments;
}

/**
 * Propose une configuration optimale des sessions en prenant en compte :
 * - Les disponibilités (et uniquement les créneaux non annulés)
 * - Le min et le max propres à chaque créneau (ou par défaut du sondage)
 * - Le nombre de parties souhaitées sur la période (0 = exclu, null = illimité)
 * - L'équité mensuelle (parties déjà attribuées sur les autres sondages du mois)
 */
export function generateOptimalSchedule(
  poll: Poll,
  monthlyOtherGames: Record<string, number>
): ScheduleOptimizationResult {
  const activeSlots = poll.slots.filter((s) => !s.cancelled);
  const slotProposals: Record<string, ProposedSlotPlan> = {};
  const assignedInPoll: Record<string, number> = {};

  const getSlotMin = (slot: (typeof activeSlots)[number]) =>
    slot.minParticipants ?? poll.minParticipants;
  const getSlotMax = (slot: (typeof activeSlots)[number]) =>
    slot.maxParticipants ?? poll.maxParticipants;

  const availabilityCount: Record<string, number> = {};
  for (const slot of activeSlots) {
    for (const uid of slot.disponibles) {
      availabilityCount[uid] = (availabilityCount[uid] || 0) + 1;
    }
  }

  const getDesired = (uid: string): number | null => {
    const val = poll.desiredGamesByUser?.[uid];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    return null;
  };

  const getRemainingQuota = (uid: string): number => {
    const desired = getDesired(uid);
    if (desired === null) return Infinity;
    return Math.max(0, desired - (assignedInPoll[uid] || 0));
  };

  const remainingSlotIds = new Set(activeSlots.map((s) => s.id));
  const viableSlotsCount = activeSlots.filter(
    (s) => s.disponibles.length >= getSlotMin(s)
  ).length;

  const scorePlayer = (uid: string): [number, number, number, number] => {
    const assignedHere = assignedInPoll[uid] || 0;
    const desired = getDesired(uid);
    const hasSpecificQuota = desired !== null && desired > 0;
    const remaining = desired !== null ? Math.max(0, desired - assignedHere) : 0;
    const rarity = availabilityCount[uid] || 99;
    const monthlyTotal = (monthlyOtherGames[uid] || 0) + assignedHere;

    return [
      assignedHere === 0 ? 0 : 1,
      hasSpecificQuota ? 0 : 1,
      -remaining * 10 + rarity,
      monthlyTotal,
    ];
  };

  const comparePlayers = (a: string, b: string): number => {
    const sa = scorePlayer(a);
    const sb = scorePlayer(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return a.localeCompare(b);
  };

  while (remainingSlotIds.size > 0) {
    let bestSlot: (typeof activeSlots)[number] | null = null;
    let bestStrictEligible: string[] = [];
    let bestScore = -1;

    for (const slot of activeSlots) {
      if (!remainingSlotIds.has(slot.id)) continue;
      const slotMin = getSlotMin(slot);
      const slotMax = getSlotMax(slot);
      if (slot.disponibles.length < slotMin) continue;

      const strictEligible = slot.disponibles.filter((uid) => getRemainingQuota(uid) > 0);
      if (strictEligible.length < slotMin) continue;

      let slotScore = Math.min(strictEligible.length, slotMax) * 100;
      for (const uid of strictEligible) {
        if ((assignedInPoll[uid] || 0) === 0) slotScore += 25;
        slotScore += Math.max(0, 10 - (availabilityCount[uid] || 10));
      }

      if (slotScore > bestScore) {
        bestScore = slotScore;
        bestSlot = slot;
        bestStrictEligible = strictEligible;
      }
    }

    if (!bestSlot) break;

    remainingSlotIds.delete(bestSlot.id);
    const slotMax = getSlotMax(bestSlot);
    const sorted = [...bestStrictEligible].sort(comparePlayers);
    const selectedIds = sorted.slice(0, slotMax);
    const waitlistIds = bestSlot.disponibles.filter(
      (uid) => !selectedIds.includes(uid) && getDesired(uid) !== 0
    );

    for (const uid of selectedIds) {
      assignedInPoll[uid] = (assignedInPoll[uid] || 0) + 1;
    }

    slotProposals[bestSlot.id] = {
      slotId: bestSlot.id,
      selectedIds,
      waitlistIds,
      teamAssignments: splitIntoBalancedTeams(selectedIds),
      reachedMin: true,
      reason: `Optimal : ${selectedIds.length} titulaire(s) retenu(s) (Min ${getSlotMin(bestSlot)} / Max ${slotMax}).`,
    };
  }

  for (const slot of activeSlots) {
    if (slotProposals[slot.id]) continue;

    const slotMin = getSlotMin(slot);
    const interested = slot.disponibles.filter((uid) => getDesired(uid) !== 0);
    const strictRemaining = interested.filter((uid) => getRemainingQuota(uid) > 0);

    let reason = `Effectif insuffisant (${slot.disponibles.length}/${slotMin} min).`;
    if (slot.disponibles.length >= slotMin && strictRemaining.length < slotMin) {
      reason = `Non retenu automatiquement : les joueurs disponibles ont déjà atteint leur quota souhaité (${strictRemaining.length}/${slotMin} restant(s)). Vous pouvez tout de même sélectionner manuellement.`;
    }

    slotProposals[slot.id] = {
      slotId: slot.id,
      selectedIds: [],
      waitlistIds: interested,
      teamAssignments: {},
      reachedMin: false,
      reason,
    };
  }

  const allKnownPlayers = new Set<string>(poll.targetUsers || []);
  for (const s of activeSlots) {
    s.disponibles.forEach((u) => allKnownPlayers.add(u));
  }
  Object.keys(poll.desiredGamesByUser || {}).forEach((u) => allKnownPlayers.add(u));

  const unfulfilledPlayers: Array<{ userId: string; desired: number; assigned: number }> = [];
  let totalRequestingPlayers = 0;
  let satisfiedPlayersCount = 0;

  for (const uid of allKnownPlayers) {
    const desired = getDesired(uid);
    if (typeof desired === 'number' && desired > 0) {
      totalRequestingPlayers++;
      const assigned = assignedInPoll[uid] || 0;
      if (assigned >= desired) {
        satisfiedPlayersCount++;
      } else {
        unfulfilledPlayers.push({ userId: uid, desired, assigned });
      }
    }
  }

  const plannedSessionsCount = Object.values(slotProposals).filter((p) => p.reachedMin).length;

  return {
    slotProposals,
    assignedInPoll,
    summary: {
      plannedSessionsCount,
      viableSlotsCount,
      satisfiedPlayersCount,
      totalRequestingPlayers,
      unfulfilledPlayers,
    },
  };
}
