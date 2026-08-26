import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModbusTcpDebugPanel, ModbusRtuDebugPanel } from "@/components/modbus-debug-panel";

export default function ModbusDebugPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Modbus debugging</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            One-off connectivity tests, independent of any configured silo — reads a single
            register and shows the raw and decoded value, or the connection error. TCP needs
            network access to the target; RTU needs a serial port on this machine. Neither works
            from Railway&apos;s cloud network — both are here for once this runs on the Pi.
          </p>
        </div>
        <Link href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Setup
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modbus TCP</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ModbusTcpDebugPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modbus RTU (serial)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ModbusRtuDebugPanel />
        </CardContent>
      </Card>
    </div>
  );
}
