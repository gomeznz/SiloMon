"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// PLC/HMI documentation almost universally lists holding registers in the
// Modicon "4xxxx" convention, where 40001 is protocol (wire) address 0 —
// but the worker polls the raw protocol address with no offset (see
// scripts/silo-worker.ts), so typing the documented number straight in
// polls the wrong register. This field can't safely auto-convert (a
// genuinely large raw address is rare but not impossible), so it just
// warns the moment the value looks like Modicon notation.
const MODICON_HOLDING_OFFSET = 40001;

export function RegisterAddressField({ defaultValue }: { defaultValue?: number }) {
  const [value, setValue] = useState(defaultValue !== undefined ? String(defaultValue) : "");
  const numeric = Number(value);
  const looksLikePlcNumber = value !== "" && Number.isInteger(numeric) && numeric >= MODICON_HOLDING_OFFSET;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="registerAddress">Register address (protocol, 0-based)</Label>
      <Input
        id="registerAddress"
        name="registerAddress"
        type="number"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {looksLikePlcNumber ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {value} looks like a PLC-documentation holding-register number (4xxxx). The address actually
          polled on the wire is usually {numeric - MODICON_HOLDING_OFFSET} ({value} − 40001) — enter that
          instead, unless you&apos;ve already confirmed {value} is the raw address for this device.
        </p>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          If your PLC documentation lists a 4xxxx-style number (e.g. 40231), subtract 40001 first.
        </p>
      )}
    </div>
  );
}
