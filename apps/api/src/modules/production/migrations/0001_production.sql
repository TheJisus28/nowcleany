-- Production orders: bulk liquid by liters/batches, or packaging into finished goods.
-- product_id references product.products by value only; code/name/unit are snapshots.
CREATE TABLE production_orders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number            bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  product_id        uuid        NOT NULL,
  product_code      text        NOT NULL,
  product_name      text        NOT NULL,
  product_type      text        NOT NULL CHECK (product_type IN ('BULK', 'FINISHED_GOOD')),
  unit              text        NOT NULL,
  batch_capacity    bigint,
  planned_quantity  bigint      NOT NULL CHECK (planned_quantity > 0),
  produced_quantity bigint      CHECK (produced_quantity IS NULL OR produced_quantity > 0),
  status            text        NOT NULL CHECK (status IN ('PLANNED', 'COMPLETED', 'CANCELLED')),
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
CREATE INDEX production_orders_status_idx ON production_orders (status, number DESC);
