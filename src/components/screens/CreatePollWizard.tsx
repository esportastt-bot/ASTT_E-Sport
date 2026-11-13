import React, { useState } from 'react';
import type { TrainingType, PeriodType } from '../../types';
import { 
  ArrowLeft, ArrowRight, Check, Calendar, Users, Settings2, 
  Clock, Hash, AlertTriangle, Eye 
} from 'lucide-react';
import { MOCK_USERS } from '../../mock/data';

interface CreatePollWizardProps {
  onCancel: () => void;
  onPublish: (pollData: any) => void;
}

const DAYS_OF_WEEK = [
  { id: '1', label: 'Lundi' },
  { id: '2', label: 'Mardi' },
  { id: '3', label: 'Mercredi' },
  { id: '4', label: 'Jeudi' },
  { id: '5', label: 'Vendredi' },
  { id: '6', label: 'Samedi' },
  { id: '0', label: 'Dimanche' },
];

export const CreatePollWizard: React.FC<CreatePollWizardProps> = ({
  onCancel,
  onPublish,
}) => {
  const [step, setStep] = useState<number>(1);
  const totalSteps = 4;

  // Form State
  const [title, setTitle] = useState('Entraînements Semaine 48 - Préparation');
  const [trainingType, setTrainingType] = useState<TrainingType>('ASTT');
  const [periodType, setPeriodType] = useState<PeriodType>('1_week');
  
  // Selected Days & Hours (Free entry)
  const [selectedDays, setSelectedDays] = useState<string[]>(['1', '2', '3', '4', '5']); // Lun à Ven
  const [startTime, setStartTime] = useState('20:30');
  const [endTime, setEndTime] = useState('21:50'); // 1h20 (2 x 40min)
  
  // Deadline
  const [deadlineDate, setDeadlineDate] = useState('2026-11-22');
  const [deadlineTime, setDeadlineTime] = useState('20:00');

  // Participants & Limits
  const [minParticipants, setMinParticipants] = useState(4);
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [discordChannel, setDiscordChannel] = useState('#annonces-matchs');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['Joueur ASTT']);
  const [excludedUsers, setExcludedUsers] = useState<string[]>([]);

  const toggleDay = (dayId: string) => {
    setSelectedDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleExcluded = (userId: string) => {
    setExcludedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Compute final participants count
  const eligibleUsers = MOCK_USERS.filter(u => {
    const hasRole = u.discordRoles.some(r => selectedRoles.includes(r));
    const isExcluded = excludedUsers.includes(u.id);
    return hasRole && !isExcluded;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      
      {/* Top Breadcrumb & Step Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour au tableau de bord
          </button>
          <h2 className="text-xl font-bold text-white">Nouveau sondage d'entraînement</h2>
        </div>

        {/* Shortcut to step 4 (Récapitulatif) */}
        {step < 4 && (
          <button
            onClick={() => setStep(4)}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Voir le récapitulatif</span>
          </button>
        )}
      </div>

      {/* Steps Indicator */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { num: 1, title: 'Général', icon: Settings2 },
          { num: 2, title: 'Créneaux', icon: Calendar },
          { num: 3, title: 'Participants', icon: Users },
          { num: 4, title: 'Validation', icon: Check },
        ].map(s => {
          const IconComponent = s.icon;
          const isActive = step === s.num;
          const isPassed = step > s.num;

          return (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
                isActive
                  ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-950/30'
                  : isPassed
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                  : 'bg-slate-950 border-slate-800/80 text-slate-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isPassed
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isPassed ? <Check className="w-3.5 h-3.5" /> : <IconComponent className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold leading-tight">{s.title}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        
        {/* STEP 1: GÉNÉRAL */}
        {step === 1 && (
          <div className="space-y-5">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-400" />
              Étape 1 : Informations générales
            </h3>

            {/* Titre libre */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Titre du sondage</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Entraînements Semaine 48"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Type d'entraînement */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Type de session</label>
              <div className="grid grid-cols-3 gap-3">
                {(['MIX', 'SCRIM', 'ASTT'] as TrainingType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrainingType(t)}
                    className={`py-3 px-4 rounded-xl border text-sm font-semibold transition ${
                      trainingType === t
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Période */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Période couverte</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: '1_week', label: '1 semaine' },
                  { id: '2_weeks', label: '2 semaines' },
                  { id: '1_month', label: '1 mois' },
                  { id: 'custom', label: 'Personnalisée' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodType(p.id as PeriodType)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                      periodType === p.id
                        ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Min & Max participants */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Min. participants requis</label>
                <input
                  type="number"
                  min="2"
                  max="16"
                  value={minParticipants}
                  onChange={(e) => setMinParticipants(parseInt(e.target.value) || 4)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Capacité maximale</label>
                <input
                  type="number"
                  min="2"
                  max="16"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(parseInt(e.target.value) || 8)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Canal Discord */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Canal Discord de publication</label>
              <div className="relative">
                <Hash className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="text"
                  value={discordChannel}
                  onChange={(e) => setDiscordChannel(e.target.value)}
                  placeholder="#annonces-matchs"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CRÉNEAUX & HORAIRES */}
        {step === 2 && (
          <div className="space-y-5">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Étape 2 : Jours proposés & Horaires libres
            </h3>

            {/* Jours proposés */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Sélectionnez les jours activés pour l'entraînement :
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DAYS_OF_WEEK.map(d => {
                  const isSelected = selectedDays.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDay(d.id)}
                      className={`p-3 rounded-xl border text-xs font-medium transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-indigo-950/80 border-indigo-500 text-white font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span>{d.label}</span>
                      {isSelected ? (
                        <Check className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <span className="text-[10px] text-slate-400">Exclu</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Saisie libre des heures */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Horaires des sessions</label>
                <span className="text-xs text-indigo-400">2 matchs de 40 min = 1h20</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400">Heure de début</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400">Heure de fin</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Date & Heure limites de réponse */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Date et heure limites de réponse (clôture automatique) :
              </label>

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Un rappel sera envoyé automatiquement à mi-parcours aux personnes n'ayant pas encore voté.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: PARTICIPANTS */}
        {step === 3 && (
          <div className="space-y-5">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              Étape 3 : Rôles Discord et participants
            </h3>

            {/* Rôles ciblés */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">Cibler par rôles Discord :</label>
              <div className="flex flex-wrap gap-2">
                {['Joueur ASTT', 'Remplaçant', 'Capitaine', 'Coach'].map(role => {
                  const isSelected = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      <span>{role}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Liste des membres résultants & Exclusion manuelle */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Membres inclus ({eligibleUsers.length} au total)
                </label>
                <span className="text-[11px] text-slate-400">Doublons éliminés automatiquement</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {MOCK_USERS.map(user => {
                  const isExcluded = excludedUsers.includes(user.id);
                  const isTargeted = user.discordRoles.some(r => selectedRoles.includes(r));

                  if (!isTargeted) return null;

                  return (
                    <div
                      key={user.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition ${
                        isExcluded
                          ? 'bg-slate-950/40 border-slate-800/50 text-slate-400 line-through'
                          : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{user.avatar}</span>
                        <span className="font-medium">{user.name}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExcluded(user.id)}
                        className={`text-[10px] px-2 py-0.5 rounded transition ${
                          isExcluded
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-red-950/60 text-red-300 border border-red-800/60 hover:bg-red-900/50'
                        }`}
                      >
                        {isExcluded ? 'Réintégrer' : 'Exclure'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: RÉCAPITULATIF COMPLET AVANT PUBLICATION */}
        {step === 4 && (
          <div className="space-y-5">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              Étape 4 : Récapitulatif avant publication
            </h3>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Titre :</span>
                <span className="font-semibold text-white">{title}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Type :</span>
                <span className="font-semibold text-indigo-400">{trainingType}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Créneaux :</span>
                <span className="font-semibold text-white">
                  {selectedDays.length} jours ({startTime} à {endTime})
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Participants ciblés :</span>
                <span className="font-semibold text-white">{eligibleUsers.length} membres</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Min / Max :</span>
                <span className="font-semibold text-white">{minParticipants} min / {maxParticipants} max</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date limite :</span>
                <span className="font-semibold text-amber-400">{deadlineDate} à {deadlineTime}</span>
              </div>
            </div>

            <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-3 text-xs text-indigo-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                À la publication, le sondage sera immédiatement accessible sur le site et une annonce avec les liens directs sera postée dans le canal <strong>{discordChannel}</strong>.
              </span>
            </div>
          </div>
        )}

        {/* Wizard Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Précédent
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-400 hover:text-white px-3 py-2 transition"
            >
              Annuler
            </button>
          )}

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
            >
              Suivant
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPublish({ title, trainingType, startTime, endTime })}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              Publier le sondage
            </button>
          )}
        </div>

      </div>

    </div>
  );
};
