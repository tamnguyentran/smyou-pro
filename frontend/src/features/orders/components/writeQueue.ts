import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { ORDER_KEY, type Order } from "../api";

export type RunOrderWrite = (task: (current: Order) => Promise<Order>) => Promise<Order>;

/** Serializes every write against one order — create, Section 1 save, add/update/remove line — so a
 * row edit's PATCH and "Lưu nháp" (or another row edit) can never race on the same optimistic-
 * concurrency `version`. Each queued step re-reads the order from the query cache right before it
 * runs, never from a stale render-time closure, so it always sees the previous step's result. */
export function useOrderWriteQueue(getId: () => string | undefined) {
  const queryClient = useQueryClient();
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  function currentOrder(): Order | undefined {
    const id = getId();
    return id !== undefined ? queryClient.getQueryData<Order>([ORDER_KEY, id]) : undefined;
  }

  function enqueue<T>(step: () => Promise<T>): Promise<T> {
    // Run the next step whether the previous one settled or failed (a STALE_VERSION on one save
    // must not permanently jam every write after it).
    const run = queueRef.current.then(step, step);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const runWrite: RunOrderWrite = (task) =>
    enqueue(async () => {
      const current = currentOrder();
      if (!current) throw new Error("runWrite called without an existing order");
      return task(current);
    });

  return { enqueue, currentOrder, runWrite };
}
