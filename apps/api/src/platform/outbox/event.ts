/** An integration event as delivered to consumers. Payloads hold only JSON-safe values. */
export interface EventEnvelope<TPayload = Record<string, unknown>> {
  readonly id: string;
  readonly type: string;
  /** Module that published it. */
  readonly source: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
  readonly requestId: string | null;
  readonly actorId: string | null;
}
