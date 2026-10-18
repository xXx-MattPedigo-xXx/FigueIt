export type Unit = 'ft' | 'in';

const INCHES_PER: Record<string, number> = {
  ft: 12, feet: 12, foot: 12, "'": 12,
  in: 1, inch: 1, inches: 1, '"': 1,
  m: 39.37007874015748, cm: 0.3937007874015748, mm: 0.03937007874015748,
};

const NUMBER = String.raw`\d+\/\d+|\d+(?:\.\d+)?(?:\s+\d+\/\d+)?`;
const TOKEN = new RegExp(String.raw`(${NUMBER})\s*(feet|foot|ft|inches|inch|in|cm|mm|m|'|")?`, 'iy');
const DASH = new RegExp(String.raw`^(\d+(?:\.\d+)?)-(${NUMBER})$`);

function parseNumber(text: string): number {
  const parts = text.trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes('/')) {
      const [n, d] = part.split('/').map(Number);
      total += n / d;
    } else {
      total += Number(part);
    }
  }
  return total;
}

/** Parses things like 12'6", 12 ft 6 in, 12-6, 3/8", 2.5m. Returns inches, or null if invalid. */
export function parseLength(text: string, defaultUnit: Unit): number | null {
  const s = text.trim();
  if (!s) return null;

  const dash = DASH.exec(s);
  if (dash) return Number(dash[1]) * 12 + parseNumber(dash[2]);

  const tokens: { value: number; unit: string | null }[] = [];
  let pos = 0;
  while (pos < s.length) {
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    if (pos >= s.length) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(s);
    if (!m) return null;
    tokens.push({ value: parseNumber(m[1]), unit: m[2] ? m[2].toLowerCase() : null });
    pos = TOKEN.lastIndex;
  }
  if (tokens.length === 0) return null;

  if (tokens.length === 1) {
    const unit = tokens[0].unit ?? defaultUnit;
    return tokens[0].value * INCHES_PER[unit];
  }

  let total = 0;
  let prevUnit: string | null = null;
  for (const t of tokens) {
    let unit = t.unit;
    if (unit === null) {
      if (prevUnit === null || INCHES_PER[prevUnit] !== 12) return null;
      unit = 'in';
    }
    total += t.value * INCHES_PER[unit];
    prevUnit = unit;
  }
  return total;
}

const FRACTIONS = ['', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'];

/** Formats inches as feet and inches to the nearest eighth: 150.5 -> 12' 6 1/2" */
export function formatLength(inches: number): string {
  const eighths = Math.round(inches * 8);
  const ft = Math.floor(eighths / 96);
  const rem = eighths - ft * 96;
  const whole = Math.floor(rem / 8);
  const frac = FRACTIONS[rem % 8];
  const inchPart = whole === 0 && frac ? frac : frac ? `${whole} ${frac}` : `${whole}`;
  if (ft === 0) return `${inchPart}"`;
  if (whole === 0 && !frac) return `${ft}'`;
  return `${ft}' ${inchPart}"`;
}

export function formatSqFt(squareInches: number): string {
  return (squareInches / 144).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
