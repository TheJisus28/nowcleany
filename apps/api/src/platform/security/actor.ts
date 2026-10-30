/** Who is performing the current operation: a signed-in user or a background job. */
export interface Actor {
  readonly id: string;
  readonly displayName: string;
  readonly permissions: ReadonlySet<string>;
  readonly system: boolean;
  /** Business role shown in the trail ("Planta", "Logística"…). */
  readonly roleName?: string | null;
}

/** An actor for work nobody clicked (jobs, consumers, seeds); `displayName` is what people read. */
export function systemActor(
  name: string,
  permissions: Iterable<string>,
  displayName = 'Sistema',
): Actor {
  return {
    id: `system:${name}`,
    displayName,
    permissions: new Set(permissions),
    system: true,
  };
}
