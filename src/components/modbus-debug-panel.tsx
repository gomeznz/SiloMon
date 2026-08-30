"use client";

import { useState } from "react";
import {
  testModbusTcpAction,
  testModbusRtuAction,
  listSerialPortsAction,
  type ModbusTestResult,
  type SerialPortInfo,
} from "@/app/admin/debug/actions";
import type { SiloDataType } from "@/lib/modbus-codec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ModiconAddressHint } from "@/components/modicon-address-hint";

const DATA_TYPES: SiloDataType[] = ["UINT16", "INT16", "UINT32", "INT32", "FLOAT32"];
const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

function ResultPanel({ result }: { result: ModbusTestResult | null }) {
  if (!result) return null;

  if (result.ok) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <div className="font-medium">Connected — {result.durationMs}ms</div>
        <div className="mt-1 text-xs">
          Raw registers: [{result.raw.join(", ")}] · Decoded: {result.decoded}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      <div className="font-medium">Failed — {result.durationMs}ms</div>
      <div className="mt-1 text-xs">{result.error}</div>
    </div>
  );
}

export function ModbusTcpDebugPanel() {
  const [host, setHost] = useState("192.168.1.50");
  const [port, setPort] = useState(502);
  const [unitId, setUnitId] = useState(1);
  const [registerAddress, setRegisterAddress] = useState(0);
  const [dataType, setDataType] = useState<SiloDataType>("UINT16");
  const [result, setResult] = useState<ModbusTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await testModbusTcpAction({ host, port, unitId, registerAddress, dataType, timeoutMs: 5000 });
      setResult(res);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tcp-host">Host / IP</Label>
          <Input id="tcp-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tcp-port">Port</Label>
          <Input id="tcp-port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tcp-unit">Unit ID</Label>
          <Input id="tcp-unit" type="number" value={unitId} onChange={(e) => setUnitId(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tcp-reg">Register address</Label>
          <Input
            id="tcp-reg"
            type="number"
            value={registerAddress}
            onChange={(e) => setRegisterAddress(Number(e.target.value))}
          />
          <ModiconAddressHint value={registerAddress} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tcp-type">Data type</Label>
          <Select id="tcp-type" value={dataType} onChange={(e) => setDataType(e.target.value as SiloDataType)}>
            {DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Button onClick={runTest} disabled={testing || !host}>
        {testing ? "Testing…" : "Test TCP connection"}
      </Button>

      <ResultPanel result={result} />
    </div>
  );
}

export function ModbusRtuDebugPanel() {
  const [path, setPath] = useState("/dev/ttyUSB0");
  const [baudRate, setBaudRate] = useState(9600);
  const [parity, setParity] = useState<"none" | "even" | "odd">("none");
  const [dataBits, setDataBits] = useState<7 | 8>(8);
  const [stopBits, setStopBits] = useState<1 | 2>(1);
  const [unitId, setUnitId] = useState(1);
  const [registerAddress, setRegisterAddress] = useState(0);
  const [dataType, setDataType] = useState<SiloDataType>("UINT16");
  const [result, setResult] = useState<ModbusTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const [ports, setPorts] = useState<SerialPortInfo[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await testModbusRtuAction({
        path,
        baudRate,
        parity,
        dataBits,
        stopBits,
        unitId,
        registerAddress,
        dataType,
        timeoutMs: 5000,
      });
      setResult(res);
    } finally {
      setTesting(false);
    }
  }

  async function scanPorts() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await listSerialPortsAction();
      if (res.ok) {
        setPorts(res.ports);
      } else {
        setScanError(res.error);
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="rtu-path">Serial port</Label>
          <button
            type="button"
            onClick={scanPorts}
            disabled={scanning}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            {scanning ? "Scanning…" : "Scan for ports"}
          </button>
        </div>
        <Input id="rtu-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/dev/ttyUSB0" />
        {scanError && <p className="text-xs text-red-600 dark:text-red-400">{scanError}</p>}
        {ports && (
          <div className="space-y-1 rounded-md border border-slate-200 p-2 dark:border-slate-800">
            {ports.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">No serial ports found.</p>
            )}
            {ports.map((p) => (
              <button
                key={p.path}
                type="button"
                onClick={() => setPath(p.path)}
                className={cn(
                  "block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800",
                  p.path === path && "bg-slate-100 dark:bg-slate-800",
                )}
              >
                <span className="font-medium">{p.path}</span>
                {p.manufacturer && <span className="text-slate-400"> · {p.manufacturer}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="rtu-baud">Baud rate</Label>
          <Select id="rtu-baud" value={baudRate} onChange={(e) => setBaudRate(Number(e.target.value))}>
            {BAUD_RATES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rtu-parity">Parity</Label>
          <Select id="rtu-parity" value={parity} onChange={(e) => setParity(e.target.value as typeof parity)}>
            <option value="none">None</option>
            <option value="even">Even</option>
            <option value="odd">Odd</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rtu-databits">Data bits</Label>
          <Select id="rtu-databits" value={dataBits} onChange={(e) => setDataBits(Number(e.target.value) as 7 | 8)}>
            <option value={8}>8</option>
            <option value={7}>7</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rtu-stopbits">Stop bits</Label>
          <Select id="rtu-stopbits" value={stopBits} onChange={(e) => setStopBits(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="rtu-unit">Unit ID</Label>
          <Input id="rtu-unit" type="number" value={unitId} onChange={(e) => setUnitId(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rtu-reg">Register address</Label>
          <Input
            id="rtu-reg"
            type="number"
            value={registerAddress}
            onChange={(e) => setRegisterAddress(Number(e.target.value))}
          />
          <ModiconAddressHint value={registerAddress} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rtu-type">Data type</Label>
          <Select id="rtu-type" value={dataType} onChange={(e) => setDataType(e.target.value as SiloDataType)}>
            {DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Button onClick={runTest} disabled={testing || !path}>
        {testing ? "Testing…" : "Test RTU connection"}
      </Button>

      <ResultPanel result={result} />
    </div>
  );
}
