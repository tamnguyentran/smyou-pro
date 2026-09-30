import { useState } from "react";
import { ChipGroup } from "../../../components/ui/Chip";
import { TextField } from "../../../components/ui/TextField";
import { VAT_CHIP_RATES, VAT_OTHER, vatOtherFieldSchema } from "../schemas";

const PRESET_OPTIONS = [
  ...VAT_CHIP_RATES.map((rate) => ({ value: String(rate), label: `${String(rate)}%` })),
  { value: VAT_OTHER, label: "Khác" },
];

/** VAT chip (UI_GUIDELINES §5): 0/8/10% quick picks + "Khác" opening a validated free-entry field.
 * Used both for the add-line form (commits into local state) and inline row editing (commits per
 * change straight to the server, per the caller's `onChange`). */
export function VatChipField({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const isPreset = (VAT_CHIP_RATES as readonly number[]).includes(value);
  const [other, setOther] = useState(isPreset ? "" : String(value));
  const [otherOpen, setOtherOpen] = useState(!isPreset);
  const [otherError, setOtherError] = useState<string | undefined>();

  return (
    <div className="space-y-2">
      <ChipGroup
        label="VAT"
        value={otherOpen ? VAT_OTHER : String(value)}
        options={PRESET_OPTIONS}
        onChange={(picked) => {
          if (disabled) return;
          if (picked === VAT_OTHER) {
            setOtherOpen(true);
            return;
          }
          setOtherOpen(false);
          setOtherError(undefined);
          onChange(Number(picked));
        }}
      />
      {otherOpen ? (
        <TextField
          label="VAT khác (%)"
          inputMode="decimal"
          disabled={disabled}
          value={other}
          error={otherError}
          onChange={(event) => {
            const raw = event.target.value;
            setOther(raw);
            const parsed = vatOtherFieldSchema.safeParse(raw);
            if (parsed.success) {
              setOtherError(undefined);
              onChange(parsed.data);
            } else {
              setOtherError(parsed.error.issues[0]?.message ?? "VAT phải trong khoảng 0-100.");
            }
          }}
        />
      ) : null}
    </div>
  );
}
