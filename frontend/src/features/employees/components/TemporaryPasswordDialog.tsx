import { Check, Clock, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { formatTimeDate } from "../../../lib/format";

/** AC-EMP-014/016: the generated password is shown exactly once — Manager copies it and sends it
 * to the employee through a separate channel (there is no email to send it to, PRD §5). */
export function TemporaryPasswordDialog({
  open,
  username,
  password,
  expiresAt,
  onClose,
}: {
  open: boolean;
  /** M17-03b: generated login name, shown with the password so the Manager can pass both on. */
  username?: string;
  password: string;
  /** M20-09: the temporary password stops working at this time (24 hours after it was issued). */
  expiresAt?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    try {
      // Some environments (older browsers, insecure contexts, jsdom) have no Clipboard API.
      void navigator.clipboard
        .writeText(password)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => {
            setCopied(false);
          }, 2000);
        })
        .catch(() => undefined);
    } catch {
      // no-op: nothing to copy to
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mật khẩu tạm"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCopy}
            icon={
              copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )
            }
          >
            {copied ? "Đã sao chép" : "Sao chép"}
          </Button>
          <Button onClick={onClose}>Đóng</Button>
        </div>
      }
    >
      {username ? (
        <p className="mb-3 text-center text-sm text-body">{`Tên đăng nhập: ${username}`}</p>
      ) : null}
      <p className="rounded-xl border border-line bg-sidebar-sub px-4 py-3 text-center font-mono text-lg tracking-wide text-heading">
        {password}
      </p>
      {expiresAt ? (
        <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-body">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>{`Hết hạn lúc ${formatTimeDate(expiresAt)}. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu.`}</span>
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-relaxed text-body">
        Mật khẩu chỉ hiện một lần. Hãy gửi cho nhân viên qua kênh riêng.
      </p>
    </Sheet>
  );
}
