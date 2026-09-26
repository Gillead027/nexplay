import { activityIdentity, type Activity, type RealtimeEvent } from '@nexplay/shared';

type Activities = ReadonlyMap<string, Activity>;

/** O que cada pessoa visível está fazendo (id -> atividade), a partir de um evento em tempo real. Mesma referência quando nada muda. */
export function applyActivityEvent(activities: Activities, event: RealtimeEvent): Activities {
  let userId: string;
  let activity: Activity | null;
  if (event.type === 'ACTIVITY_UPDATE') {
    userId = event.userId;
    activity = event.activity;
  } else if (event.type === 'PRESENCE_UPDATE') {
    // Offline (ou invisível) não mostra atividade; ao ficar visível de novo o evento já traz a atual.
    userId = event.userId;
    activity = event.online ? (event.activity ?? null) : null;
  } else {
    return activities;
  }

  const current = activities.get(userId) ?? null;
  if (activityIdentity(current) === activityIdentity(activity)) return activities;
  const next = new Map(activities);
  if (activity) next.set(userId, activity);
  else next.delete(userId);
  return next;
}

/** A leitura inicial do servidor (servidores mais antigos não mandam "activities"). */
export function activitiesFromResponse(response: { activities?: Record<string, Activity> }): Activities {
  return new Map(Object.entries(response.activities ?? {}));
}
