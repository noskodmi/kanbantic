/**
 * Small presentational helpers reused across read-side pages.
 */

/** "0x44C1…dDdE" — 6-char head, 4-char tail, mixed-case preserved. */
export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  const head = address.slice(0, 6);
  const tail = address.slice(-4);
  return `${head}…${tail}`;
}

export function parseCapabilities(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function etherscanAddress(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
