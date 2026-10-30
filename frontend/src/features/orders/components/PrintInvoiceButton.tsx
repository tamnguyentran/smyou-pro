import { Printer } from "lucide-react";
import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { useMe } from "../../me/api";
import { fetchInvoicePrint, type InvoicePrintData, type Order } from "../api";
import { InvoicePrint } from "./InvoicePrint";

// Same breakpoint as AppShell's sidebar (UI_GUIDELINES §3): printing is a desktop-only flow (M17-04).
const DESKTOP = "(min-width: 1024px)";

/** Resolves once every <img> under `root` is decoded (or failed), so the logo is on the paper. */
function imagesSettled(root: HTMLElement | null): Promise<unknown> {
  return Promise.all(
    Array.from(root?.querySelectorAll("img") ?? []).map((img) =>
      // jsdom has no decode(); real browsers resolve it once the image is loaded.
      "decode" in img ? img.decode().catch(() => undefined) : Promise.resolve(),
    ),
  );
}

// The sheet lives in its own React root on <body>, outside the app tree: printing lays the page out
// at paper width (< 1024px), which re-renders the app as mobile — unmounting this button and even the
// whole AppShell outlet — and a sheet inside that tree would vanish from the paper.
let printRoot: { el: HTMLDivElement; root: Root } | null = null;

function unmountSheet() {
  printRoot?.root.unmount();
  printRoot?.el.remove();
  printRoot = null;
}

function mountSheet(order: Order, data: InvoicePrintData): HTMLDivElement {
  if (!printRoot) {
    const el = document.createElement("div");
    el.className = "invoice-print-root";
    document.body.append(el);
    printRoot = { el, root: createRoot(el) };
  }
  const { el, root } = printRoot;
  flushSync(() => {
    root.render(<InvoicePrint order={order} data={data} />);
  });
  return el;
}

/** "In" Hoá đơn bán hàng (M17-04 §6). Not rendered at all below 1024px, without `order.print`, or for
 * a cancelled order; disabled while `order` is missing (never saved) or has `unsaved` edits. */
export function PrintInvoiceButton({
  order,
  unsaved = false,
}: {
  order?: Order;
  unsaved?: boolean;
}) {
  const desktop = useMediaQuery(DESKTOP, true);
  const me = useMe();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const hintId = useId();

  if (!desktop || !me.data || !("order.print" in me.data.capabilities)) return null;
  if (order?.status === "CANCELLED") return null;
  const blocked = !order || unsaved;

  async function preparePrint(target: Order) {
    setLoading(true);
    let data: InvoicePrintData;
    try {
      data = await fetchInvoicePrint(target.id);
    } catch {
      setLoading(false);
      toast("Không tải được dữ liệu in. Vui lòng thử lại.");
      return;
    }
    await imagesSettled(mountSheet(target, data));
    setLoading(false);
    // Removed once the dialog closes, so a later Ctrl+P on another page prints that page, not this sheet.
    window.addEventListener("afterprint", unmountSheet, { once: true });
    window.print();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        icon={<Printer aria-hidden="true" className="size-4" />}
        loading={loading}
        disabled={blocked}
        aria-disabled={blocked}
        aria-describedby={blocked ? hintId : undefined}
        onClick={() => {
          if (order) void preparePrint(order);
        }}
      >
        {loading ? "Đang chuẩn bị…" : "In"}
      </Button>
      {blocked ? (
        <span id={hintId} className="text-xs text-muted">
          Lưu đơn trước khi in
        </span>
      ) : null}
    </span>
  );
}
