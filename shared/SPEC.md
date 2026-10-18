# FigueIt shared spec

Both implementations (`web-ts/` TypeScript, `blazor/` C#) implement exactly this, and both must pass
`spec.json`. All internal lengths are **inches**; areas are square inches internally, reported in sq ft.

## Length parsing

`parseLength(text, defaultUnit)` returns inches, or invalid.

- Tokens: a number then an optional unit. Number is `12`, `12.5`, `3/8`, or mixed `6 1/2`.
- Units: `'` `ft` `feet` `foot` = feet; `"` `in` `inch` `inches` = inches; `m`, `cm`, `mm`.
- A lone unitless value uses `defaultUnit`. A unitless token after a feet token is inches (`12' 6`).
  Any other unitless token is invalid.
- `12-6` (digits, dash, digits) means feet-inches.
- Tokens add up (`12' 6"` = 150). Anything unparsed, negative, or empty is invalid.

## Shapes (all produce a counter-clockwise polygon, inches)

| type        | params       | vertices |
|-------------|--------------|----------|
| rectangle   | w, h         | (0,0) (w,0) (w,h) (0,h) |
| triangle    | a, b, c      | A=(0,0) B=(c,0) C=(x,y), x=(b²+c²−a²)/(2c), y=√(b²−x²); invalid if sides break the triangle inequality |
| lshape      | w, h, nw, nh | rectangle w×h with an nw×nh notch removed from the top-right corner |
| trapezoid   | b1, b2, h    | (0,0) (b1,0) ((b1+b2)/2,h) ((b1−b2)/2,h) |
| polygon     | points       | given directly (inches); reversed if clockwise |

Area is the shoelace formula, perimeter the sum of edge lengths.

## Layout

Inputs: paver length `L`, width `W`, joint `g`, pattern, rotation (degrees), offset (x,y inches).

- Cell size: `Lc = L + g`, `Wc = W + g`. A paver is its cell inset by `g/2` on every side (so it is `L×W`).
- Pattern space: shape point `p` maps to pattern space by `rotate(p − offset, −rotation)`.
  Cells are laid out axis-aligned in pattern space; clipped pieces map back for display.
- `k = round(Lc / Wc)`. Herringbone and basketweave are **applicable** only if `k >= 2`
  and `|Lc/Wc − k| <= 0.03·k`; otherwise the engine reports "not applicable" instead of a layout.

Cells by pattern (integer indices i, j, m, n):

- **stack**: cell origin `(i·Lc, j·Wc)`, size `Lc × Wc`.
- **running**: origin `(i·Lc + (j odd ? Lc/2 : 0), j·Wc)`, size `Lc × Wc`.
- **herringbone**: with `u=(Wc,Wc)`, `v=(−Lc,Lc)`, `b = m·u + n·v`:
  a horizontal cell at `b` of size `Lc × Wc`, and a vertical cell at `b + (Lc, Wc−Lc)` of size `Wc × Lc`.
  (45° herringbone is this pattern with rotation 45.)
- **basketweave**: blocks of `Lc × Lc` at `(i·Lc, j·Lc)`, each holding `k` strips of width `Lc/k`:
  horizontal strips when `(i+j)` is even, vertical when odd.

## Counting

For each paver rectangle, clip it to the shape; let `a` be the clipped area and `A` the area of that
paver rectangle (equal to `L·W` except for the small ratio fudge allowed in basketweave strips).

- `a >= A·(1 − 1e-6)` → **full**
- `a >= 0.05` sq in → **cut** (one stone is needed per cut piece)
- otherwise ignored

`total = full + cut`. `orderQty = ceil(total · (1 + wastePercent/100))`.
`minimum = ceil(area / (L·W))` is the theoretical floor with zero cuts or waste.
