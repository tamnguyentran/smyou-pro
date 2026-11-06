/** AC-UI-061/062 (M20-04): body of the in-modal Alert after a line add/remove hit STALE_VERSION and
 * the order was re-fetched in the background — the modal stays open for a retry. Two sentences in
 * their own spans so the first one reads the same as the inline-row toast (AC-ORD-240). */
export function StaleReloadedMessage({ retryLabel }: { retryLabel: "Thêm" | "Xoá" }) {
  return (
    <>
      <span>Đơn vừa được người khác cập nhật, đã tải lại dữ liệu mới.</span>{" "}
      <span>{`Vui lòng kiểm tra và bấm ${retryLabel} lại.`}</span>
    </>
  );
}
