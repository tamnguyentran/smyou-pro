import { Button } from "./Button";

/** "from–to / total" + Trang trước/sau, used by any paginated list (employees, audit log, ...). */
export function Pagination({
  total,
  limit,
  offset,
  onOffset,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (offset: number) => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="flex items-center justify-between text-sm text-body">
      <p>{`${String(from)}–${String(to)} / ${String(total)}`}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={offset === 0}
          onClick={() => {
            onOffset(Math.max(0, offset - limit));
          }}
        >
          Trang trước
        </Button>
        <Button
          variant="secondary"
          disabled={to >= total}
          onClick={() => {
            onOffset(offset + limit);
          }}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}
