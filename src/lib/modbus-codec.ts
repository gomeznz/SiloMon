import type { silos } from "@/db/schema";

export type SiloDataType = (typeof silos.$inferSelect)["dataType"];

const THIRTY_TWO_BIT_TYPES = new Set<SiloDataType>(["UINT32", "INT32", "FLOAT32"]);

export function registerLength(dataType: SiloDataType): number {
  return THIRTY_TWO_BIT_TYPES.has(dataType) ? 2 : 1;
}

// Shared with scripts/silo-simulator.ts, which uses encodeValue (below) to
// produce registers this function must decode back to the same value —
// keep the two in sync.
export function decodeRegisters(registers: number[], dataType: SiloDataType): number {
  if (registers.length === 1) {
    const raw = registers[0];
    return dataType === "INT16" && raw >= 0x8000 ? raw - 0x10000 : raw;
  }

  const buf = Buffer.alloc(4);
  buf.writeUInt16BE(registers[0], 0);
  buf.writeUInt16BE(registers[1], 2);
  if (dataType === "FLOAT32") return buf.readFloatBE(0);
  if (dataType === "INT32") return buf.readInt32BE(0);
  return buf.readUInt32BE(0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Inverse of decodeRegisters, used by the simulator to fabricate readings
// that round-trip correctly through the real worker's decoding.
export function encodeValue(value: number, dataType: SiloDataType): number[] {
  if (dataType === "UINT16") {
    return [clamp(Math.round(value), 0, 0xffff)];
  }
  if (dataType === "INT16") {
    const v = clamp(Math.round(value), -0x8000, 0x7fff);
    return [v < 0 ? v + 0x10000 : v];
  }

  const buf = Buffer.alloc(4);
  if (dataType === "FLOAT32") {
    buf.writeFloatBE(value, 0);
  } else if (dataType === "INT32") {
    buf.writeInt32BE(clamp(Math.round(value), -0x80000000, 0x7fffffff), 0);
  } else {
    buf.writeUInt32BE(clamp(Math.round(value), 0, 0xffffffff), 0);
  }
  return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
}
