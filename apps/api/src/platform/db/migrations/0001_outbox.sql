-- Transactional outbox. Module roles may only INSERT (granted by the migrator); the platform role
-- (worker dispatcher, health checks) reads and updates it.
CREATE TABLE outbox (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      uuid        NOT NULL UNIQUE,
  type          text        NOT NULL,
  source        text        NOT NULL,
  payload       jsonb       NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  request_id    text,
  actor_id      text,
  attempts      integer     NOT NULL DEFAULT 0,
  available_at  timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  published_at  timestamptz,
  failed_at     timestamptz
);

CREATE INDEX outbox_pending_idx ON outbox (id) WHERE published_at IS NULL AND failed_at IS NULL;
