import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";

/** AC-EMP-014/016: the generated password is shown exactly once — Manager copies it and sends it
 * to the employee through a separate channel (there is no email to send it to, PRD §5). */
export function TemporaryPasswordDialog({
  open,
  password,
  onClose,
}: {
  open: boolean;
  password: string;
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
    <Sheet open={open} onClose={onClose} title="Mật khẩu tạm">
      <p className="rounded-xl border border-line bg-sidebar-sub px-4 py-3 text-center font-mono text-lg tracking-wide text-heading">
        {password}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-body">
        Mật khẩu chỉ hiện một lần. Hãy gửi cho nhân viên qua kênh riêng.
      </p>
      <div className="mt-6 flex justify-end gap-3">
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
    </Sheet>
  );
}
