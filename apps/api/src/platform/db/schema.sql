-- SCIP schema: one PostgreSQL schema for the whole application.
-- Quantities are bigint in the base unit of each product's dimension (mg, mL, un).

-- Users and sessions (roles and permissions live in code: modules/identity/access.ts)
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

CREATE TABLE user_roles (
  user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_code text NOT NULL,
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

-- Products and versioned formulas
CREATE TABLE products (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text        NOT NULL UNIQUE,
  name           text        NOT NULL,
  type           text        NOT NULL CHECK (type IN ('RAW_MATERIAL', 'BULK', 'FINISHED_GOOD', 'RESALE')),
  stock_unit     text        NOT NULL CHECK (stock_unit IN ('kg', 'g', 'mg', 'L', 'mL', 'un')),
  batch_capacity bigint,
  -- Pesos (COP) per stock unit: sale price of finished goods, purchase cost of raw materials.
  price          bigint,
  cost           bigint,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE formulas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid        NOT NULL REFERENCES products (id),
  version           integer     NOT NULL,
  status            text        NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  batch_yield       bigint      NOT NULL CHECK (batch_yield > 0),
  notes             text,
  created_by        text        NOT NULL,
  created_by_name   text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  published_by      text,
  published_by_name text,
  published_at      timestamptz,
  retired_at        timestamptz,
  UNIQUE (product_id, version)
);
CREATE UNIQUE INDEX formulas_one_draft ON formulas (product_id) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX formulas_one_active ON formulas (product_id) WHERE status = 'ACTIVE';

CREATE TABLE formula_lines (
  formula_id   uuid    NOT NULL REFERENCES formulas (id) ON DELETE CASCADE,
  line_no      integer NOT NULL,
  component_id uuid    NOT NULL REFERENCES products (id),
  quantity     bigint  NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (formula_id, line_no)
);

-- Inventory: balances may be negative (overselling is allowed)
CREATE TABLE warehouses (
  id     uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  code   text    NOT NULL UNIQUE,
  name   text    NOT NULL,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO warehouses (code, name) VALUES ('PLANTA', 'Bodega de planta'), ('DESPACHO', 'Bodega de despacho');

CREATE TABLE stock_balances (
  warehouse_id uuid        NOT NULL REFERENCES warehouses (id),
  product_id   uuid        NOT NULL REFERENCES products (id),
  on_hand      bigint      NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id)
);

-- Kardex: one row per movement with the resulting balance
CREATE TABLE stock_movements (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id    uuid        NOT NULL,
  warehouse_id    uuid        NOT NULL REFERENCES warehouses (id),
  product_id      uuid        NOT NULL REFERENCES products (id),
  type            text        NOT NULL,
  quantity        bigint      NOT NULL,
  balance_after   bigint      NOT NULL,
  reference_type  text,
  reference_id    text,
  reference_label text,
  note            text,
  actor_id        text        NOT NULL,
  actor_name      text        NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, id DESC);

CREATE TABLE operations (
  idempotency_key text        PRIMARY KEY,
  operation_id    uuid        NOT NULL,
  type            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Sales
CREATE TABLE customers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type   text        NOT NULL CHECK (document_type IN ('NIT', 'CC')),
  document_number text        NOT NULL UNIQUE,
  name            text        NOT NULL,
  address         text,
  phone           text,
  city            text,
  seller_id       uuid        REFERENCES users (id),
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Where orders are delivered and sellers visit; the location lets the panel check visits.
CREATE TABLE customer_branches (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid        NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  address     text,
  city        text,
  phone       text,
  latitude    double precision,
  longitude   double precision,
  is_main     boolean     NOT NULL DEFAULT false,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales_orders (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number                  bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id             uuid        NOT NULL REFERENCES customers (id),
  branch_id               uuid        NOT NULL REFERENCES customer_branches (id),
  seller_id               text        NOT NULL,
  seller_name             text        NOT NULL,
  status                  text        NOT NULL,
  estimated_delivery_date date,
  notes                   text,
  -- Set by the consolidator: which invoiced orders get the available stock first (lower first).
  priority                integer,
  -- The consolidator allows shipping what exists now and the rest later.
  allow_partial           boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  confirmed_at            timestamptz,
  invoiced_at             timestamptz,
  invoiced_by_name        text,
  ready_at                timestamptz,
  ready_by_name           text,
  dispatched_at           timestamptz,
  dispatched_by_name      text,
  delivered_at            timestamptz,
  received_by             text,
  cancelled_at            timestamptz,
  cancelled_by_name       text,
  cancel_reason           text
);

CREATE TABLE sales_order_lines (
  order_id     uuid    NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
  line_no      integer NOT NULL,
  product_id   uuid    NOT NULL REFERENCES products (id),
  product_code text    NOT NULL,
  product_name text    NOT NULL,
  unit         text    NOT NULL,
  quantity     bigint  NOT NULL,
  ready_quantity      bigint NOT NULL DEFAULT 0,
  dispatched_quantity bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, line_no)
);

-- Production
CREATE TABLE production_orders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number            bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  product_id        uuid        NOT NULL REFERENCES products (id),
  product_code      text        NOT NULL,
  product_name      text        NOT NULL,
  product_type      text        NOT NULL,
  unit              text        NOT NULL,
  batch_capacity    bigint,
  planned_quantity  bigint      NOT NULL,
  produced_quantity bigint,
  status            text        NOT NULL,
  scheduled_date    date,
  notes             text,
  created_by        text        NOT NULL,
  created_by_name   text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  completed_by_name text,
  cancelled_at      timestamptz,
  cancelled_by_name text
);

-- Purchasing
CREATE TABLE suppliers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text        UNIQUE,
  name            text        NOT NULL,
  contact         text,
  phone           text,
  email           text,
  city            text,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE purchase_orders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number            bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  supplier_id       uuid        NOT NULL REFERENCES suppliers (id),
  supplier          text        NOT NULL,
  expected_date     date,
  status            text        NOT NULL,
  notes             text,
  receipt_document  text,
  created_by        text        NOT NULL,
  created_by_name   text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  received_at       timestamptz,
  received_by_name  text,
  cancelled_at      timestamptz,
  cancelled_by_name text
);

CREATE TABLE purchase_order_lines (
  order_id          uuid    NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  line_no           integer NOT NULL,
  product_id        uuid    NOT NULL REFERENCES products (id),
  product_code      text    NOT NULL,
  product_name      text    NOT NULL,
  unit              text    NOT NULL,
  quantity          bigint  NOT NULL,
  received_quantity bigint,
  -- Pesos per stock unit agreed with the supplier.
  unit_cost         bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, line_no)
);

-- Seller visits, checked in with the phone's GPS
CREATE TABLE visits (
  id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   uuid             NOT NULL REFERENCES users (id),
  customer_id uuid             NOT NULL REFERENCES customers (id),
  branch_id   uuid             NOT NULL REFERENCES customer_branches (id),
  visited_at  timestamptz      NOT NULL DEFAULT now(),
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  accuracy_m  integer,
  distance_m  integer,
  notes       text,
  order_id    uuid             REFERENCES sales_orders (id)
);
CREATE INDEX visits_seller_idx ON visits (seller_id, visited_at DESC);

-- --- billing: invoices of confirmed pre-sales (consolidator) and customer payments (accountant) ---------

CREATE TABLE invoices (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FEL: electronic invoice with VAT; REM: remisión, a sale document without taxes (the customer chooses).
  document_type     text        NOT NULL DEFAULT 'FEL' CHECK (document_type IN ('FEL', 'REM')),
  -- Consecutive per document type.
  number            bigint      NOT NULL,
  order_id          uuid        NOT NULL UNIQUE REFERENCES sales_orders (id),
  order_label       text        NOT NULL,
  customer_id       uuid        NOT NULL REFERENCES customers (id),
  customer_name     text        NOT NULL,
  customer_document text        NOT NULL,
  branch_name       text        NOT NULL,
  seller_id         text        NOT NULL,
  seller_name       text        NOT NULL,
  issued_at         timestamptz NOT NULL DEFAULT now(),
  due_date          date        NOT NULL,
  subtotal          bigint      NOT NULL,
  tax               bigint      NOT NULL,
  total             bigint      NOT NULL,
  paid              bigint      NOT NULL DEFAULT 0,
  issued_by_name    text        NOT NULL,
  UNIQUE (document_type, number)
);

CREATE INDEX invoices_customer_idx ON invoices (customer_id, issued_at DESC);

CREATE TABLE invoice_lines (
  invoice_id   uuid    NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  line_no      integer NOT NULL,
  product_id   uuid    NOT NULL REFERENCES products (id),
  product_code text    NOT NULL,
  product_name text    NOT NULL,
  unit         text    NOT NULL,
  quantity     bigint  NOT NULL,
  unit_price   bigint  NOT NULL,
  amount       bigint  NOT NULL,
  -- Coverage when it was invoiced: what came from stock and what was left to make or buy.
  from_stock   bigint  NOT NULL DEFAULT 0,
  pending      bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (invoice_id, line_no)
);

CREATE TABLE payments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid        NOT NULL REFERENCES invoices (id),
  amount           bigint      NOT NULL CHECK (amount > 0),
  paid_on          date        NOT NULL,
  method           text        NOT NULL,
  reference        text,
  recorded_by_name text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- --- logistics: shipping guides (several invoiced orders on one vehicle) --------------------------------

CREATE TABLE shipments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number             bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  carrier            text        NOT NULL,
  vehicle_plate      text        NOT NULL,
  driver_name        text        NOT NULL,
  route              text,
  scheduled_date     date        NOT NULL,
  status             text        NOT NULL CHECK (status IN ('PLANNED', 'IN_TRANSIT', 'DELIVERED')),
  notes              text,
  created_by_name    text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  dispatched_at      timestamptz,
  dispatched_by_name text,
  delivered_at       timestamptz
);

CREATE TABLE shipment_orders (
  shipment_id  uuid        NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  order_id     uuid        NOT NULL REFERENCES sales_orders (id),
  position     integer     NOT NULL,
  delivered_at timestamptz,
  received_by  text,
  PRIMARY KEY (shipment_id, order_id)
);

-- What each guide carries of each order (a partial dispatch carries part of it).
CREATE TABLE shipment_lines (
  shipment_id  uuid   NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  order_id     uuid   NOT NULL REFERENCES sales_orders (id),
  product_id   uuid   NOT NULL REFERENCES products (id),
  product_code text   NOT NULL,
  product_name text   NOT NULL,
  unit         text   NOT NULL,
  quantity     bigint NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (shipment_id, order_id, product_id)
);

-- --- purchasing: supplier invoices entered by receiving (each one brings the goods in) ------------------

CREATE TABLE supplier_invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid       NOT NULL REFERENCES purchase_orders (id),
  supplier_id      uuid        NOT NULL REFERENCES suppliers (id),
  supplier_name    text        NOT NULL,
  document_number  text        NOT NULL,
  invoice_date     date        NOT NULL,
  due_date         date        NOT NULL,
  subtotal         bigint      NOT NULL,
  tax              bigint      NOT NULL,
  total            bigint      NOT NULL,
  paid             bigint      NOT NULL DEFAULT 0,
  received_by_name text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, document_number)
);

CREATE TABLE supplier_invoice_lines (
  supplier_invoice_id uuid    NOT NULL REFERENCES supplier_invoices (id) ON DELETE CASCADE,
  line_no             integer NOT NULL,
  product_id          uuid    NOT NULL REFERENCES products (id),
  product_code        text    NOT NULL,
  product_name        text    NOT NULL,
  unit                text    NOT NULL,
  quantity            bigint  NOT NULL CHECK (quantity > 0),
  unit_cost           bigint  NOT NULL,
  amount              bigint  NOT NULL,
  PRIMARY KEY (supplier_invoice_id, line_no)
);

CREATE TABLE supplier_payments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id uuid        NOT NULL REFERENCES supplier_invoices (id),
  amount              bigint      NOT NULL CHECK (amount > 0),
  paid_on             date        NOT NULL,
  method              text        NOT NULL,
  reference           text,
  recorded_by_name    text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Purchasing's plan for a month: how much of each sellable product it expects to need.
CREATE TABLE purchase_plans (
  month       date        NOT NULL,
  product_id  uuid        NOT NULL REFERENCES products (id),
  quantity    bigint      NOT NULL CHECK (quantity >= 0),
  set_by_name text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, product_id)
);

-- --- audit: who did and authorized each step of every document (the trail) ------------------------------

CREATE TABLE activity_log (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text        NOT NULL,
  entity_id   uuid        NOT NULL,
  label       text        NOT NULL,
  action      text        NOT NULL,
  summary     text        NOT NULL,
  actor_id    text        NOT NULL,
  actor_name  text        NOT NULL,
  actor_role  text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_log_entity_idx ON activity_log (entity_type, entity_id, id);
CREATE INDEX activity_log_time_idx ON activity_log (occurred_at DESC);
