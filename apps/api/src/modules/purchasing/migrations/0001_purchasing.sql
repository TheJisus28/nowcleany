-- Minimal purchase orders: what purchasing already bought and is on its way (planning nets it out).
CREATE TABLE purchase_orders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number            bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  supplier          text        NOT NULL CHECK (char_length(supplier) BETWEEN 2 AND 160),
  expected_date     date,
  status            text        NOT NULL CHECK (status IN ('OPEN', 'RECEIVED', 'CANCELLED')),
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
CREATE INDEX purchase_orders_status_idx ON purchase_orders (status, number DESC);

CREATE TABLE purchase_order_lines (
  order_id          uuid    NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  line_no           integer NOT NULL CHECK (line_no > 0),
  product_id        uuid    NOT NULL,
  product_code      text    NOT NULL,
  product_name      text    NOT NULL,
  unit              text    NOT NULL,
  quantity          bigint  NOT NULL CHECK (quantity > 0),
  received_quantity bigint  CHECK (received_quantity IS NULL OR received_quantity >= 0),
  PRIMARY KEY (order_id, line_no),
  UNIQUE (order_id, product_id)
);
