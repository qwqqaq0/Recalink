import { isIP } from "node:net";

function ipv4Parts(address: string): number[] {
  return address.split(".").map(Number);
}

function isSpecialIpv4(address: string): boolean {
  const [a = -1, b = -1, c = -1] = ipv4Parts(address);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isSpecialIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isSpecialIpv4(mapped) : true;
  }
  return normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    /^fe[89ab]/u.test(normalized) || normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:");
}

export function assertPublicAddress(address: string): void {
  const family = isIP(address);
  const blocked = family === 0 ||
    (family === 4 && isSpecialIpv4(address)) ||
    (family === 6 && isSpecialIpv6(address));
  if (blocked) throw new Error("不允许访问私有或特殊网络地址");
}
