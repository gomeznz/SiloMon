"use client";

// PLC/HMI documentation almost universally lists holding registers in the
// Modicon "4xxxx" convention, where 40001 is protocol (wire) address 0 —
// but every Modbus call in this app (the worker and both debug panels)
// polls the raw protocol address with no offset, so typing the documented
// number straight in silently polls the wrong register. Shared by
// register-address-field.tsx (silo forms) and modbus-debug-panel.tsx.
const MODICON_HOLDING_OFFSET = 40001;

export function ModiconAddressHint({ value }: { value: number }) {
  const looksLikePlcNumber = Number.isInteger(value) && value >= MODICON_HOLDING_OFFSET;

  if (!looksLikePlcNumber) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        If your PLC documentation lists a 4xxxx-style number (e.g. 40231), subtract 40001 first.
      </p>
    );
  }

  return (
    <p className="text-xs text-amber-600 dark:text-amber-400">
      {value} looks like a PLC-documentation holding-register number (4xxxx). The address actually polled
      on the wire is usually {value - MODICON_HOLDING_OFFSET} ({value} − 40001) — try that instead, unless
      you&apos;ve already confirmed {value} is the raw address for this device.
    </p>
  );
}
