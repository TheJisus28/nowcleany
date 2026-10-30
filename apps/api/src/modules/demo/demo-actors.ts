import { Injectable } from '@nestjs/common';
import { CurrentActor } from '../../platform/security/current-actor.js';
import { type DirectoryUser, roleNameOf, UserDirectory } from '../identity/index.js';

/** The demo team: each step of the example data is done by the person whose job it is. */
export const TEAM = {
  manager: 'gerencia@nowcleany.local',
  consolidator: 'consolidado@nowcleany.local',
  plant: 'planta@nowcleany.local',
  logistics: 'logistica@nowcleany.local',
  purchasing: 'compras@nowcleany.local',
  receiving: 'recepcion@nowcleany.local',
  accountant: 'contable@nowcleany.local',
} as const;

/** Runs seed steps as a real demo user, so the trail shows who did what (Diego, Silvia, Alfonso…). */
@Injectable()
export class DemoActors {
  private readonly users = new Map<string, DirectoryUser>();

  constructor(
    private readonly directory: UserDirectory,
    private readonly currentActor: CurrentActor,
  ) {}

  async as<T>(email: string, fn: () => Promise<T>): Promise<T> {
    const user = await this.user(email);
    return this.currentActor.runAs(
      {
        id: user.id,
        displayName: user.fullName,
        permissions: new Set(user.permissions),
        system: false,
        roleName: roleNameOf(user.roles),
      },
      fn,
    );
  }

  async user(email: string): Promise<DirectoryUser> {
    const cached = this.users.get(email);
    if (cached) return cached;
    const [user] = await this.directory.findByEmails([email]);
    if (!user) throw new Error(`Usuario de demo ${email} no encontrado`);
    this.users.set(email, user);
    return user;
  }

  async emailOf(userId: string): Promise<string> {
    const [user] = await this.directory.findByIds([userId]);
    if (!user) throw new Error(`Usuario ${userId} no encontrado`);
    this.users.set(user.email, user);
    return user.email;
  }
}

/** Deterministic pseudo-random numbers, so every seeded database looks the same. */
export function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** A local Colombian time on a calendar day ("2026-10-12", 9.5 → 09:30 −05:00). */
export function at(day: string, hour: number): Date {
  const total = Math.min(23 * 60 + 59, Math.round(hour * 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return new Date(
    `${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-05:00`,
  );
}

export function todayIso(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** First day of the month `delta` months from the month of `day`. */
export function monthStart(day: string, delta = 0): string {
  const [year = 0, month = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 10);
}
