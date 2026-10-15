import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { usePushSubscribe, usePushUnsubscribe } from "../api";
import {
  getCurrentSubscription,
  isPushSupported,
  subscribeToPush,
  toSubscriptionBody,
  unsubscribeFromPush,
} from "../webPush";

const GENERIC_SUBSCRIBE_ERROR =
  "Không bật được thông báo trên thiết bị này. Vui lòng cho phép quyền thông báo trong trình duyệt.";
const GENERIC_UNSUBSCRIBE_ERROR = "Không tắt được thông báo trên thiết bị này. Vui lòng thử lại.";

/** M10-05: đăng ký/bỏ đăng ký nhận Web Push trên đúng thiết bị/trình duyệt đang mở — ẩn hẳn nếu
 * trình duyệt không hỗ trợ (vài Safari cũ). Server chưa cấu hình VAPID → cha không render cái này. */
export function PushSubscriptionToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const supported = isPushSupported();
  const [subscription, setSubscription] = useState<PushSubscription | null | undefined>(
    supported ? undefined : null,
  );
  const [error, setError] = useState<string | null>(null);
  const subscribe = usePushSubscribe();
  const unsubscribe = usePushUnsubscribe();

  useEffect(() => {
    if (!supported) return;
    getCurrentSubscription()
      .then(setSubscription)
      .catch(() => {
        setSubscription(null);
      });
  }, [supported]);

  if (!supported || subscription === undefined) return null;

  async function handleSubscribe() {
    setError(null);
    try {
      const sub = await subscribeToPush(vapidPublicKey);
      await subscribe.mutateAsync(toSubscriptionBody(sub));
      setSubscription(sub);
    } catch {
      setError(GENERIC_SUBSCRIBE_ERROR);
    }
  }

  async function handleUnsubscribe() {
    if (!subscription) return;
    setError(null);
    try {
      await unsubscribe.mutateAsync(subscription.endpoint);
      await unsubscribeFromPush(subscription);
      setSubscription(null);
    } catch {
      setError(GENERIC_UNSUBSCRIBE_ERROR);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert>{error}</Alert> : null}
      {subscription ? (
        <Button
          variant="secondary"
          onClick={() => {
            void handleUnsubscribe();
          }}
          loading={unsubscribe.isPending}
          icon={<BellOff aria-hidden="true" className="size-4" />}
          className="w-full"
        >
          Tắt thông báo trên thiết bị này
        </Button>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            void handleSubscribe();
          }}
          loading={subscribe.isPending}
          icon={<BellRing aria-hidden="true" className="size-4" />}
          className="w-full"
        >
          Nhận thông báo trên thiết bị này
        </Button>
      )}
    </div>
  );
}
