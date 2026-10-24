export abstract class PermissionCatalogRepository {
  abstract roleCodes(): Promise<Set<string>>;
  abstract upsertPermissions(
    permissions: readonly { code: string; description: string }[],
  ): Promise<void>;
  /** Adds grants that do not exist yet; never removes grants an administrator configured. */
  abstract grant(grants: readonly { role: string; permission: string }[]): Promise<void>;
}
