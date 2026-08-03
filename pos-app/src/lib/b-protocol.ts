const STX = 0x02;
const ETX = 0x03;
const FS = 0x1c;

export interface BProtocolFields {
  [fid: string]: string;
}

export interface BProtocolMessage {
  protocolType: string;
  version: string;
  terminalId: string;
  dateTime: string;
  flags: string;
  dataLength: string;
  crc: string;
  fields: BProtocolFields;
  raw: Buffer;
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    pad(date.getFullYear() % 100) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function normalizeTerminalId(terminalId: string): string {
  return terminalId.trim().padEnd(8, " ").slice(0, 8);
}

function buildHeader(options: {
  messageClass: "B1" | "B0";
  terminalId: string;
  flags?: string;
  dataLength: number;
}): string {
  const dt = formatDateTime(new Date());
  const tid = normalizeTerminalId(options.terminalId);
  const flags = (options.flags ?? "0000").padStart(4, "0").slice(0, 4);
  const dlen = options.dataLength.toString(16).toUpperCase().padStart(4, "0").slice(-4);
  return `${options.messageClass}01${tid}${dt}${flags}${dlen}A5A5`;
}

function appendField(parts: Buffer[], fid: string, value: string) {
  parts.push(Buffer.from([FS]));
  parts.push(Buffer.from(fid + value, "ascii"));
}

export function buildHandshakeMessage(terminalId: string): Buffer {
  const dataParts: Buffer[] = [];
  appendField(dataParts, "T", "95");
  const data = Buffer.concat(dataParts);
  const header = buildHeader({
    messageClass: "B1",
    terminalId,
    flags: "8000",
    dataLength: data.length,
  });
  return Buffer.concat([Buffer.from([STX]), Buffer.from(header, "ascii"), data, Buffer.from([ETX])]);
}

export function buildSaleMessage(terminalId: string, amountCzk: number): Buffer {
  const amountHalere = Math.round(amountCzk * 100);
  const dataParts: Buffer[] = [];
  appendField(dataParts, "T", "00");
  appendField(dataParts, "B", String(amountHalere));
  appendField(dataParts, "E", "203");
  const data = Buffer.concat(dataParts);
  const header = buildHeader({
    messageClass: "B1",
    terminalId,
    flags: "0200",
    dataLength: data.length,
  });
  return Buffer.concat([Buffer.from([STX]), Buffer.from(header, "ascii"), data, Buffer.from([ETX])]);
}

export function buildAckMessage(terminalId: string): Buffer {
  const header = buildHeader({
    messageClass: "B0",
    terminalId,
    flags: "0000",
    dataLength: 0,
  });
  return Buffer.concat([Buffer.from([STX]), Buffer.from(header, "ascii"), Buffer.from([ETX])]);
}

export function parseBProtocolMessages(buffer: Buffer): BProtocolMessage[] {
  const messages: BProtocolMessage[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const start = buffer.indexOf(STX, offset);
    if (start === -1) break;
    const end = buffer.indexOf(ETX, start + 1);
    if (end === -1) break;

    const packet = buffer.subarray(start, end + 1);
    const body = packet.subarray(1, packet.length - 1).toString("ascii");

    if (body.length < 36) {
      offset = end + 1;
      continue;
    }

    const header = body.slice(0, 36);
    const data = body.slice(36);
    const fields: BProtocolFields = {};

    if (data.length > 0) {
      const segments = data.split(String.fromCharCode(FS)).filter(Boolean);
      for (const segment of segments) {
        if (segment.length < 2) continue;
        const fid = segment.charAt(0);
        fields[fid] = segment.slice(1);
      }
    }

    messages.push({
      protocolType: header.slice(0, 2),
      version: header.slice(2, 4),
      terminalId: header.slice(4, 12),
      dateTime: header.slice(12, 24),
      flags: header.slice(24, 28),
      dataLength: header.slice(28, 32),
      crc: header.slice(32, 36),
      fields,
      raw: packet,
    });

    offset = end + 1;
  }

  return messages;
}

export function extractLast4FromPan(pan?: string): string | undefined {
  if (!pan) return undefined;
  const digits = pan.replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  return digits.slice(-4);
}

export function isApprovedResponse(message: BProtocolMessage): boolean {
  const code = message.fields.R;
  return code === "000" || code === "001" || code === "010";
}

export function isBusyResponse(message: BProtocolMessage): boolean {
  return message.fields.R === "-30";
}

export function needsExplicitAck(message: BProtocolMessage): boolean {
  const flagValue = Number.parseInt(message.flags, 16);
  return (flagValue & 0x8000) !== 0;
}
