/** 1234 -> "1,234" */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatSqM(squareInches: number): string {
  return (squareInches * 0.00064516).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
