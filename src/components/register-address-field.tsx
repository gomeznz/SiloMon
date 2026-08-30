"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModiconAddressHint } from "@/components/modicon-address-hint";

export function RegisterAddressField({ defaultValue }: { defaultValue?: number }) {
  const [value, setValue] = useState(defaultValue !== undefined ? String(defaultValue) : "");

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
      <ModiconAddressHint value={Number(value)} />
    </div>
  );
}
