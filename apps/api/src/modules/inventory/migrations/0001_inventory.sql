-- Inventory: the only module that writes stock. Overselling is allowed: balances may be negative.

CREATE TABLE warehouses (
  id     uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  code   text    NOT NULL UNIQUE,
  name   text    NOT NULL,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO warehouses (code, name) VALUES
  ('PLANTA', 'Bodega de planta'),
  ('DESPACHO', 'Bodega de despacho')
ON CONFLICT (code) DO NOTHING;

-- product_id references product.products by value only (no cross-schema foreign keys).
CREATE TABLE stock_balances (
  warehouse_id uuid        NOT NULL REFERENCES warehouses (id),
  product_id   uuid        NOT NULL,
  on_hand      bigint      NOT NULL DEFAULT 0,
  reserved     bigint      NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id)
);
CREATE INDEX stock_balances_product_idx ON stock_balances (product_id);

-- Kardex: append-only ledger with the resulting balance of each line.
CREATE TABLE stock_movements (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id   uuid        NOT NULL,
  warehouse_id   uuid        NOT NULL REFERENCES warehouses (id),
  product_id     uuid        NOT NULL,
  type           text        NOT NULL CHECK (type IN (
                   'INITIAL_LOAD', 'RECEIPT', 'PRODUCTION_OUTPUT', 'PRODUCTION_CONSUMPTION',
                   'TRANSFER_OUT', 'TRANSFER_IN', 'DISPATCH', 'ADJUSTMENT')),
  quantity       bigint      NOT NULL CHECK (quantity <> 0),
  balance_after  bigint      NOT NULL,
  reference_type text,
  reference_id   text,
  reference_label text,
  note           text,
  actor_id       text        NOT NULL,
  actor_name     text        NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, id DESC);
CREATE INDEX stock_movements_operation_idx ON stock_movements (operation_id);

-- Committed demand of finished goods per sales order (idempotent by order and product).
CREATE TABLE reservations (
  order_id     text        NOT NULL,
  order_label  text        NOT NULL,
  product_id   uuid        NOT NULL,
  warehouse_id uuid        NOT NULL REFERENCES warehouses (id),
  quantity     bigint      NOT NULL CHECK (quantity > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX reservations_product_idx ON reservations (product_id);

-- Idempotency of operations requested by other modules (production orders, purchase orders, ...).
CREATE TABLE operations (
  idempotency_key text        PRIMARY KEY,
  operation_id    uuid        NOT NULL,
  type            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inbox (
  consumer     text        NOT NULL,
  event_id     uuid        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- The ledger is immutable even for the module's own role.
REVOKE UPDATE, DELETE ON stock_movements FROM app_inventory;
