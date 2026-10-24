-- Users, roles (as data), permissions synced from code, and refresh-token sessions.
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  full_name     text        NOT NULL,
  password_hash text        NOT NULL,
  active        boolean     NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE roles (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL
);

CREATE TABLE permissions (
  code        text        PRIMARY KEY,
  description text        NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_code       text NOT NULL REFERENCES roles (code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE user_roles (
  user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_code text NOT NULL REFERENCES roles (code),
  PRIMARY KEY (user_id, role_code)
);

CREATE TABLE sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text        NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

INSERT INTO roles (code, name, description) VALUES
  ('admin',          'Administrador', 'Acceso total, incluida la administración de usuarios.'),
  ('manager',        'Gerencia',      'Ve todos los paneles y el reporte de sobreventa.'),
  ('formulator',     'Formulador',    'Define productos y borradores de fórmulas.'),
  ('technical_lead', 'Jefe técnico',  'Revisa y publica fórmulas.'),
  ('sales',          'Ventas',        'Registra y gestiona preventas.'),
  ('plant',          'Planta',        'Programa y registra producción y envasado.'),
  ('purchasing',     'Compras',       'Gestiona órdenes de compra según los faltantes.'),
  ('warehouse',      'Bodega',        'Recepciones, traslados, despachos y ajustes de inventario.')
ON CONFLICT (code) DO NOTHING;
