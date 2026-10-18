# FigueIt UI spec

Both UIs (`web-ts/` React, `blazor/` Blazor WebAssembly) implement this same feature set so they can be
compared fairly. Visual polish is each version's own, but the features, defaults and colours below are shared.
The engine does all the math (see `SPEC.md`); the UI never re-implements geometry or counting.

## Layout

- Header with the name **FigueIt**.
- Two panes. Left: the **plotter** (an SVG drawing of the shape and the paver layout). Right: controls, then results.
- Under ~800 px wide the panes stack, plotter on top. It must be usable on a phone.

## Defaults (first run, and after Reset)

The app starts on a **blank grid**: no shape is drawn.

- Shape type is **Custom polygon** with no points. The plotter shows an empty 20' x 20' grid (1 ft lines) that
  the user can tap straight away, with a hint over it: "Tap the grid to start your outline, or choose a shape type".
- Every shape dimension field (all types) starts **empty**, with an example as placeholder text (for example `14'`).
  An empty field means "not entered yet": no red border and no error message. Only text the user typed that
  does not parse, or dimensions that are impossible, are errors.
- With no shape yet, Results show "Draw or enter a shape to see results" instead of numbers, and the
  Compare patterns table is hidden. The plotter shows the blank grid (not a "last valid shape", since there is none).
- Unchanged: paver 8 x 4 in, joint 1/8 in, pattern herringbone, rotation 0, offset 0,0, waste 10%.

State is saved to `localStorage` (key `figueit.react.v1` or `figueit.blazor.v1`, distinct so both versions can
share one website) on every change and restored on load, so a returning user sees their own last patio. A
**Reset** button returns to the blank grid above.

## Controls

**Shape** - a type selector: Rectangle, Triangle (three sides), L-shape, Trapezoid, Custom polygon.

- Each type shows its text fields (Rectangle: width, height. Triangle: side a, b, c. L-shape: width, height,
  notch width, notch height. Trapezoid: bottom, top, height).
- Shape fields accept the length syntax in `SPEC.md` with **feet** as the default unit (`12`, `12'6"`, `12-6`).
- An invalid or impossible field gets a red border and a one-line message (for example "sides can't form a triangle").
  While any field is invalid, the plotter keeps showing the last valid shape and results are marked out of date.
- **Custom polygon**: the user clicks the plotter to add points, snapped to a 6 inch grid, and the shape closes
  when they click the first point or press a **Close shape** button. Points can be dragged (also snapped). A
  **Clear points** button starts over. Needs at least 3 points to produce results. If any two edges cross
  (a self-intersecting outline), show "edges cross - move a point" and no results, rather than guessing.

**Paver** - length, width and joint, text fields with **inches** as the default unit. A preset dropdown fills
them in: 4x8 brick, 6x9, 6x6, 12x12, 16x16, 24x24, Custom (selected automatically when the fields are edited).
Joint default 1/8".

**Pattern** - selector of the four patterns. A pattern that is not applicable to the current paver (see `SPEC.md`)
is shown disabled with a note such as "needs a 2:1 paver". If the selected pattern becomes inapplicable, show
a warning in the results and an empty layout (do not silently switch).

**Rotation** - degrees (number field plus 0 / 45 / 90 quick buttons). **Offset** - x and y in inches
(number fields); lets the user slide the pattern to change where the cuts land.

**Waste %** - number field, default 10.

## Results

- Area in sq ft (2 decimals) and sq m, perimeter as feet-inches.
- Full pavers, cut pavers, total to lay (full + cut), **order quantity** with waste, theoretical minimum.
- A **Compare patterns** table: one row per applicable pattern with full, cut, total and order quantity for
  the current shape, paver, rotation and offset. The row with the lowest order quantity is highlighted, and
  the current pattern is marked. Clicking a row selects that pattern.
- Numbers use thousands separators.

## Plotter

- Y axis points up (flip the engine's coordinates for SVG). Scale to fit the shape with a margin, and keep the
  aspect ratio. Faint grid lines at 1 ft.
- Shape fill `#f4efe6`, outline `#2b2b2b` 2px. Full pavers fill `#c8b8a0`, cut pavers (draw the clipped piece)
  fill `#e8a87c`; paver stroke `#8a7560` thin. Gaps are the joints, so they show naturally.
- Each outline edge gets a length label (feet-inches, nearest 1/8") at its midpoint, offset outward.
- A small legend: full paver, cut paver.
- Changing any input redraws immediately. A layout of ~3,000 pavers should still feel responsive.

## Not in scope

Accounts, backend, cost estimates, exporting, circles. Keep it a static client-side app.
