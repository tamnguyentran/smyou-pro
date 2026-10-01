export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="text-body">{value || "—"}</p>
    </div>
  );
}
