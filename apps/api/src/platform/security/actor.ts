/** Who is performing the current operation: a signed-in user or a background job. */
export interface Actor {
  readonly id: string;
  readonly displayName: string;
  readonly permissions: ReadonlySet<string>;
  readonly system: boolean;
}

export function systemActor(name: string, permissions: Iterable<string>): Actor {
  return {
    id: `system:${name}`,
    displayName: name,
    permissions: new Set(permissions),
    system: true,
  };
}
