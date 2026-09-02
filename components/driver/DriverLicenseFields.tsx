import { Field } from '../ui';
import { Select } from '../ui/Select';
import { DateField } from '../ui/DateField';
import { LICENSE_CLASS_OPTIONS } from '../../lib/driverFields';

export function DriverLicenseFields({
  primaryValue,
  secondaryValue,
  expiryValue,
  primaryError,
  expiryError,
  onPrimaryChange,
  onSecondaryChange,
  onExpiryChange,
  disableExpiry = false,
}: {
  primaryValue: string;
  secondaryValue: string;
  expiryValue: string;
  primaryError?: string;
  expiryError?: string;
  onPrimaryChange: (value: string) => void;
  onSecondaryChange: (value: string) => void;
  onExpiryChange: (value: string) => void;
  disableExpiry?: boolean;
}) {
  return (
    <>
      <Field label="דרגת רישיון" error={primaryError}>
        <Select
          value={primaryValue || null}
          onChange={(value) => {
            onPrimaryChange(value ?? '');
            if (!value || value === secondaryValue) onSecondaryChange('');
          }}
          options={LICENSE_CLASS_OPTIONS}
          placeholder="בחר דרגת רישיון"
          hasError={!!primaryError}
        />
      </Field>

      {!!primaryValue && (
        <Field label="דרגת רישיון נוספת" optional>
          <Select
            value={secondaryValue || null}
            onChange={(value) => onSecondaryChange(value ?? '')}
            options={LICENSE_CLASS_OPTIONS.filter((option) => option.value !== primaryValue)}
            placeholder="בחר דרגה נוספת (אם יש)"
            allowClear
          />
        </Field>
      )}

      <Field label="תוקף רישיון" error={expiryError}>
        <DateField
          value={expiryValue || null}
          onChange={(iso) => onExpiryChange(iso ?? '')}
          hasError={!!expiryError}
          disabled={disableExpiry}
        />
      </Field>
    </>
  );
}
