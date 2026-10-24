import type { Generated } from 'kysely';

export interface IdentityTables {
  users: {
    id: Generated<string>;
    email: string;
    full_name: string;
    password_hash: string;
    active: Generated<boolean>;
    last_login_at: Date | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  roles: { code: string; name: string; description: string };
  permissions: { code: string; description: string; synced_at: Generated<Date> };
  role_permissions: { role_code: string; permission_code: string };
  user_roles: { user_id: string; role_code: string };
  sessions: {
    id: Generated<string>;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
    created_at: Generated<Date>;
  };
}
