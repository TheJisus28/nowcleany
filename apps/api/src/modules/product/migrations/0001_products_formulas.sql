-- Products (raw materials, bulk liquids, finished goods) and versioned two-level formulas.
-- Quantities are bigint in the base unit of the product's dimension (mg, mL, un).

CREATE TABLE products (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text        NOT NULL UNIQUE
                 CHECK (code = upper(code) AND code ~ '^[A-Z0-9][A-Z0-9._-]{0,39}$'),
  name           text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  type           text        NOT NULL CHECK (type IN ('RAW_MATERIAL', 'BULK', 'FINISHED_GOOD')),
  stock_unit     text        NOT NULL CHECK (stock_unit IN ('kg', 'g', 'mg', 'L', 'mL', 'un')),
  batch_capacity bigint      CHECK (batch_capacity IS NULL OR (type = 'BULK' AND batch_capacity > 0)),
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Code, type and stock unit never change: stock and formulas are expressed in that unit.
CREATE FUNCTION products_guard_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code <> OLD.code OR NEW.type <> OLD.type OR NEW.stock_unit <> OLD.stock_unit THEN
    RAISE EXCEPTION 'product % : code, type and stock unit are immutable', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_guard_identity BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_guard_identity();

CREATE TABLE formulas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid        NOT NULL REFERENCES products (id),
  version           integer     NOT NULL CHECK (version > 0),
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
CREATE UNIQUE INDEX formulas_one_draft_per_product ON formulas (product_id) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX formulas_one_active_per_product ON formulas (product_id) WHERE status = 'ACTIVE';

CREATE TABLE formula_lines (
  formula_id   uuid    NOT NULL REFERENCES formulas (id) ON DELETE CASCADE,
  line_no      integer NOT NULL CHECK (line_no > 0),
  component_id uuid    NOT NULL REFERENCES products (id),
  quantity     bigint  NOT NULL CHECK (quantity > 0),
  waste_bps    integer NOT NULL CHECK (waste_bps BETWEEN 0 AND 10000),
  PRIMARY KEY (formula_id, line_no),
  UNIQUE (formula_id, component_id)
);

-- A published formula is immutable; the only allowed change is ACTIVE → RETIRED.
CREATE FUNCTION formulas_guard_published() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'formula % is published and cannot be deleted', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'RETIRED'
     AND NEW.product_id = OLD.product_id AND NEW.version = OLD.version
     AND NEW.batch_yield = OLD.batch_yield
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.published_by IS NOT DISTINCT FROM OLD.published_by
     AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'formula % is published and immutable', OLD.id USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER formulas_guard_published BEFORE UPDATE OR DELETE ON formulas
  FOR EACH ROW EXECUTE FUNCTION formulas_guard_published();

CREATE FUNCTION formula_lines_guard_published() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT status INTO parent_status FROM formulas
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.formula_id ELSE NEW.formula_id END;
  -- NULL: the parent draft is being deleted in the same statement (cascade).
  IF parent_status IS NOT NULL AND parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'lines of published formula cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER formula_lines_guard_published BEFORE INSERT OR UPDATE OR DELETE ON formula_lines
  FOR EACH ROW EXECUTE FUNCTION formula_lines_guard_published();
