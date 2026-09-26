import { Button } from "../../components/ui/Button";

/** /me could not be loaded: say so and offer a retry (not role=alert — it is not a form error). */
export function MeError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3 px-3 text-sm text-body">
      <p>Không tải được thông tin tài khoản.</p>
      <Button variant="secondary" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}
