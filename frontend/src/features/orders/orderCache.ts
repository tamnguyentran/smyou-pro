import type { Order } from "./api";

/** M3-07 (chưa cài đặt): giữ bản chụp đơn mới hơn khi một phản hồi cũ về sau. */
export function freshestOrder(_cached: Order | undefined, incoming: Order): Order {
  return incoming;
}
