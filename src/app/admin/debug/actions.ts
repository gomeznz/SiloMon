"use server";

// One-off connectivity tests for the Modbus debugging page — not tied to
// any configured silo. Each call opens its own connection, reads a single
// register (or pair, for 32-bit types), and closes it; nothing here is
// cached or persisted. Real socket/serial I/O, so this only actually
// connects to anything when the app is running somewhere with network or
// serial access to the target — not on Railway, but fine once this is
// running on the Pi.

import ModbusRTU from "modbus-serial";
import { decodeRegisters, registerLength, type SiloDataType } from "@/lib/modbus-codec";

export type ModbusTestResult =
  | { ok: true; raw: number[]; decoded: number; durationMs: number }
  | { ok: false; error: string; durationMs: number };

async function readOneRegister(
  client: ModbusRTU,
  unitId: number,
  registerAddress: number,
  dataType: SiloDataType,
): Promise<{ raw: number[]; decoded: number }> {
  client.setID(unitId);
  const length = registerLength(dataType);
  const { data } = await client.readHoldingRegisters(registerAddress, length);
  return { raw: data, decoded: decodeRegisters(data, dataType) };
}

export async function testModbusTcpAction(input: {
  host: string;
  port: number;
  unitId: number;
  registerAddress: number;
  dataType: SiloDataType;
  timeoutMs: number;
}): Promise<ModbusTestResult> {
  const startedAt = Date.now();
  const client = new ModbusRTU();
  try {
    client.setTimeout(input.timeoutMs);
    await client.connectTCP(input.host, { port: input.port });
    const { raw, decoded } = await readOneRegister(client, input.unitId, input.registerAddress, input.dataType);
    return { ok: true, raw, decoded, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startedAt };
  } finally {
    client.close(() => {});
  }
}

export async function testModbusRtuAction(input: {
  path: string;
  baudRate: number;
  parity: "none" | "even" | "odd";
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  unitId: number;
  registerAddress: number;
  dataType: SiloDataType;
  timeoutMs: number;
}): Promise<ModbusTestResult> {
  const startedAt = Date.now();
  const client = new ModbusRTU();
  try {
    client.setTimeout(input.timeoutMs);
    await client.connectRTU(input.path, {
      baudRate: input.baudRate,
      parity: input.parity,
      dataBits: input.dataBits,
      stopBits: input.stopBits,
    });
    const { raw, decoded } = await readOneRegister(client, input.unitId, input.registerAddress, input.dataType);
    return { ok: true, raw, decoded, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startedAt };
  } finally {
    client.close(() => {});
  }
}

export type SerialPortInfo = { path: string; manufacturer?: string; serialNumber?: string };

export async function listSerialPortsAction(): Promise<
  { ok: true; ports: SerialPortInfo[] } | { ok: false; error: string }
> {
  try {
    const ports = await ModbusRTU.getPorts();
    return {
      ok: true,
      ports: ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer, serialNumber: p.serialNumber })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
