/**
 * Exact arithmetic on the API's non-negative decimal strings ("60", "12.5"), so quantities sent back
 * to the API never go through floating point.
 */
function scaled(a: string, b: string): [bigint, bigint, number] {
  const scale = Math.max(a.split('.')[1]?.length ?? 0, b.split('.')[1]?.length ?? 0);
  const toInt = (value: string) => {
    const negative = value.startsWith('-');
    const [integer = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
    const result = BigInt(`${integer}${fraction.padEnd(scale, '0')}`);
    return negative ? -result : result;
  };
  return [toInt(a), toInt(b), scale];
}

function toDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`;
}

export function compareDecimals(a: string, b: string): number {
  const [x, y] = scaled(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function minDecimal(a: string, b: string): string {
  return compareDecimals(a, b) <= 0 ? a : b;
}

/** a − b, never below zero. */
export function subtractDecimals(a: string, b: string): string {
  const [x, y, scale] = scaled(a, b);
  return toDecimal(x > y ? x - y : 0n, scale);
}

export function isPositive(value: string): boolean {
  return compareDecimals(value, '0') > 0;
}
