import { FileUp, Loader2, Upload } from "lucide-react";
import { useState, type ChangeEvent, type DragEvent } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { ApiError } from "../auth/errors";
import {
  clientFileError,
  ENTITY_CONFIG,
  fileLevelErrorMessage,
  importErrorRows,
  templateUrl,
  useImportCommit,
  useImportPreview,
  type ImportEntity,
  type ImportPreview,
  type ImportRow,
} from "./api";

type Step = "select" | "preview";

const RE_UPLOAD_HINT = "Sửa file gốc và tải lại để nhập.";
const STALE_BANNER = "File có dòng bị lỗi (có thể do dữ liệu vừa thay đổi). Kiểm tra lại bên dưới.";

function cellValue(row: ImportRow, key: string): string {
  const value = row.data[key];
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function fieldError(row: ImportRow, key: string) {
  return row.errors?.find((error) => error.field === key);
}

/** AC-CAT-046..057: upload → preview (per-row errors) → confirm → commit, for Products or Services,
 * reusing the same two backend endpoints (M2-03a) parameterised by `entity`. */
export function CatalogImportSheet({
  entity,
  onClose,
}: {
  entity: ImportEntity;
  onClose: () => void;
}) {
  const config = ENTITY_CONFIG[entity];
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const toast = useToast();
  const preview = useImportPreview(entity);
  const commit = useImportCommit(entity);

  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [commitBanner, setCommitBanner] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resetToSelect = () => {
    setStep("select");
    setFile(null);
    setFileError(null);
    setResult(null);
    setCommitBanner(null);
  };

  const pick = async (candidate: File) => {
    if (!candidate.name.toLowerCase().endsWith(".csv")) {
      setFileError("Chỉ chấp nhận file .csv.");
      return;
    }
    const clientError = await clientFileError(candidate);
    if (clientError) {
      setFileError(clientError);
      return;
    }
    setFileError(null);
    setFile(candidate);
    try {
      const data = await preview.mutateAsync(candidate);
      setResult(data);
      setCommitBanner(null);
      setStep("preview");
    } catch (error) {
      setFileError(fileLevelErrorMessage(error));
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const candidate = event.target.files?.[0];
    event.target.value = "";
    if (candidate) void pick(candidate);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const candidate = event.dataTransfer.files[0];
    if (candidate) void pick(candidate);
  };

  const onConfirm = async () => {
    if (!file) return;
    try {
      const created = await commit.mutateAsync(file);
      toast(`Đã nhập ${String(created.created)} ${config.singular}.`);
      setConfirmOpen(false);
      onClose();
    } catch (error) {
      setConfirmOpen(false);
      const rows = importErrorRows(error);
      if (rows) setResult(rows);
      setCommitBanner(
        rows
          ? STALE_BANNER
          : error instanceof ApiError
            ? (error.problem.detail ?? "Không thực hiện được. Vui lòng thử lại.")
            : "Không thực hiện được. Vui lòng thử lại.",
      );
    }
  };

  const busy = preview.isPending;

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={config.title}
        dismissible={!busy && !confirmOpen && !commit.isPending}
        footer={
          step === "preview" && result ? (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={resetToSelect}
                disabled={commit.isPending}
              >
                Chọn file khác
              </Button>
              <Button
                type="button"
                disabled={result.invalid_count > 0}
                onClick={() => {
                  setConfirmOpen(true);
                }}
              >
                Xác nhận nhập
              </Button>
            </div>
          ) : undefined
        }
      >
        {step === "select" ? (
          <div className="space-y-4">
            <div
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={onDrop}
              data-testid="catalog-import-dropzone"
              className="space-y-3 rounded-2xl border-2 border-dashed border-line p-6 text-center"
            >
              <FileUp aria-hidden="true" className="mx-auto size-8 text-muted" />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading hover:bg-sidebar-sub">
                <Upload aria-hidden="true" className="size-4" />
                Chọn file
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  disabled={busy}
                  onChange={onInputChange}
                />
              </label>
              <p className="text-xs text-muted">Tối đa 500 dòng, 2MB, mã hoá UTF-8</p>
              <a
                href={templateUrl(entity)}
                download
                className="inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
              >
                Tải file mẫu
              </a>
            </div>
            {busy ? (
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Đang xử lý…
              </p>
            ) : null}
            {fileError ? <Alert>{fileError}</Alert> : null}
          </div>
        ) : result ? (
          <div className="space-y-4">
            {commitBanner ? <Alert>{commitBanner}</Alert> : null}
            <p className="text-sm font-medium text-heading">
              {result.valid_count}/{result.total} dòng hợp lệ
              {result.invalid_count > 0 ? ` · ${String(result.invalid_count)} dòng lỗi` : ""}
            </p>

            {desktop ? (
              <div
                role="region"
                aria-label="Bảng xem trước dữ liệu nhập"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ARIA APG scrollable-region pattern: axe's scrollable-region-focusable rule requires this container be keyboard-reachable since it overflows horizontally.
                tabIndex={0}
                className="overflow-x-auto rounded-2xl border border-line"
              >
                <table className="w-full min-w-[640px] bg-card text-left text-sm">
                  <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Dòng
                      </th>
                      {config.columns.map((column) => (
                        <th key={column.key} scope="col" className="px-3 py-2">
                          {column.label}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2">
                        Trạng thái
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Chi tiết lỗi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {result.rows.map((row) => (
                      <tr key={row.line}>
                        <td className="px-3 py-2 text-body">{row.line}</td>
                        {config.columns.map((column) => {
                          const error = fieldError(row, column.key);
                          return (
                            <td
                              key={column.key}
                              className={
                                error
                                  ? "border border-urgent-border px-3 py-2 text-body"
                                  : "px-3 py-2 text-body"
                              }
                            >
                              {cellValue(row, column.key)}
                              {error ? (
                                <p className="mt-1 text-xs text-urgent-fg">{error.message}</p>
                              ) : null}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2">
                          {row.errors && row.errors.length > 0 ? (
                            <Badge tone="urgent">Lỗi</Badge>
                          ) : (
                            <Badge tone="completed">Hợp lệ</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-urgent-fg">
                          {row.errors
                            ?.map((error) => `${error.field}: ${error.message}`)
                            .join(" · ") ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="space-y-3">
                {result.rows.map((row) => (
                  <li
                    key={row.line}
                    className="space-y-2 rounded-2xl border border-line bg-card p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted">Dòng {row.line}</span>
                      {row.errors && row.errors.length > 0 ? (
                        <Badge tone="urgent">Lỗi</Badge>
                      ) : (
                        <Badge tone="completed">Hợp lệ</Badge>
                      )}
                    </div>
                    {config.columns.map((column) => (
                      <p key={column.key} className="text-sm text-body">
                        <span className="text-muted">{column.label}: </span>
                        {cellValue(row, column.key)}
                      </p>
                    ))}
                    {row.errors && row.errors.length > 0 ? (
                      <ul className="space-y-0.5 text-xs text-urgent-fg">
                        {row.errors.map((error) => (
                          <li key={error.field}>
                            {error.field}: {error.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {result.invalid_count > 0 ? (
              <p className="text-xs text-muted">{RE_UPLOAD_HINT}</p>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      {confirmOpen && result ? (
        <ConfirmDialog
          open
          onClose={() => {
            setConfirmOpen(false);
          }}
          title="Xác nhận nhập"
          message={`Nhập ${String(result.total)} ${config.singular} mới vào danh mục?`}
          confirmLabel="Xác nhận nhập"
          onConfirm={() => void onConfirm()}
          loading={commit.isPending}
        />
      ) : null}
    </>
  );
}
