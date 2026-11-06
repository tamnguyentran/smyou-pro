import { Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../lib/cn";
import { formatCurrency } from "../../../lib/format";
import { ApiError } from "../../auth/errors";
import { useSetKpiTarget, type KpiTargetRow } from "../api";

const MAX_TARGET = 10 ** 13; // backend kpi_targets.models.MAX_TARGET
const INVALID = "Chỉ tiêu phải là số nguyên không âm";
const STALE = "Chỉ tiêu vừa được người khác sửa, đã tải lại";

/** Live vi-VN grouping while typing digits ("30.000.000"); anything else is kept as typed so the
 * save can reject it with a message instead of silently dropping characters (AC-KPI-049). */
function grouped(raw: string): string {
  if (!/^[\d.]*$/.test(raw)) return raw;
  return raw.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseTarget(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d[\d.]*$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(/\./g, ""));
  return Number.isSafeInteger(value) && value <= MAX_TARGET ? value : null;
}

/** AC-KPI-048/049/050: chạm để sửa chỉ tiêu tại chỗ — Lưu/Enter, Huỷ/Esc. */
export function TargetCell({
  row,
  month,
  onDelete,
}: {
  row: KpiTargetRow;
  month: string;
  onDelete: (row: KpiTargetRow) => void;
}) {
  const toast = useToast();
  const setTarget = useSetKpiTarget();
  const errorId = useId();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const editing = text !== null;
  // Opened by an explicit tap on the value, so focus goes straight to the input.
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const shown = row.target === null ? "Chưa đặt" : formatCurrency(row.target);

  if (row.employee_status === "INACTIVE") {
    return <span className="text-sm text-body">{shown}</span>;
  }

  const close = () => {
    setText(null);
    setError(null);
  };

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = parseTarget(text ?? "");
    if (target === null) {
      setError(INVALID);
      return;
    }
    try {
      await setTarget.mutateAsync({ row, month, target });
      toast("Đã lưu chỉ tiêu");
      close();
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === "STALE_VERSION") {
        toast(STALE);
        close();
        return;
      }
      setError(err instanceof ApiError ? (err.problem.detail ?? INVALID) : "Không lưu được.");
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Sửa chỉ tiêu của ${row.employee_name}`}
          onClick={() => {
            setText(row.target === null ? "" : grouped(String(row.target)));
          }}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm transition duration-200 hover:bg-sidebar-sub",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            row.target === null ? "text-muted" : "font-semibold text-heading tabular-nums",
          )}
        >
          <span>{shown}</span>
          <Pencil aria-hidden="true" className="size-4 text-muted" />
        </button>
        {row.target !== null ? (
          <button
            type="button"
            aria-label="Xoá chỉ tiêu"
            onClick={() => {
              onDelete(row);
            }}
            className="flex size-11 items-center justify-center rounded-xl text-muted transition duration-200 hover:bg-urgent-bg hover:text-urgent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          inputMode="numeric"
          placeholder="VD: 20.000.000"
          aria-label={`Chỉ tiêu của ${row.employee_name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={text}
          onChange={(event) => {
            setText(grouped(event.target.value));
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className={cn(
            "h-11 w-40 rounded-xl border border-line bg-card px-3 text-right text-base text-body tabular-nums",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-focus focus-visible:ring-offset-2",
            error && "border-urgent-fg",
          )}
        />
        <Button type="submit" loading={setTarget.isPending}>
          Lưu
        </Button>
        <Button variant="secondary" onClick={close} disabled={setTarget.isPending}>
          Huỷ
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-urgent-fg">
          {error}
        </p>
      ) : null}
    </form>
  );
}
