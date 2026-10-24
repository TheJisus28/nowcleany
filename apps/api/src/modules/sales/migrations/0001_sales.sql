-- Customers and pre-sale orders. product_id and seller_id reference other modules by value only.

CREATE TABLE customers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  tax_id     text,
  phone      text,
  city       text,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_tax_id_key ON customers (tax_id) WHERE tax_id IS NOT NULL;

CREATE TABLE sales_orders (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number                  bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id             uuid        NOT NULL REFERENCES customers (id),
  seller_id               text        NOT NULL,
  seller_name             text        NOT NULL,
  status                  text        NOT NULL
                          CHECK (status IN ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'CANCELLED')),
  estimated_delivery_date date,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- Set when a confirmation starts; a draft left with it set for 30 min gets its reservations released.
  confirmation_started_at timestamptz,
  confirmed_at            timestamptz,
  dispatched_at           timestamptz,
  dispatched_by_name      text,
  cancelled_at            timestamptz,
  cancelled_by_name       text,
  cancel_reason           text
);
CREATE INDEX sales_orders_status_idx ON sales_orders (status, created_at DESC);
CREATE INDEX sales_orders_seller_idx ON sales_orders (seller_id, created_at DESC);

CREATE TABLE sales_order_lines (
  order_id     uuid    NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
  line_no      integer NOT NULL CHECK (line_no > 0),
  product_id   uuid    NOT NULL,
  product_code text    NOT NULL,
  product_name text    NOT NULL,
  unit         text    NOT NULL,
  quantity     bigint  NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, line_no),
  UNIQUE (order_id, product_id)
);

CREATE TABLE inbox (
  consumer     text        NOT NULL,
  event_id     uuid        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
