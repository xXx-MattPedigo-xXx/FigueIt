namespace FigueIt.Engine;

public enum PatternId
{
    Stack,
    Running,
    Herringbone,
    Basketweave,
}

/// <summary>Paver dimensions in inches.</summary>
public readonly record struct Paver(double Length, double Width, double Joint);

/// <summary>Axis-aligned rectangle (origin + size).</summary>
public readonly record struct CellRect(double X, double Y, double W, double H);

public readonly record struct BBox(double MinX, double MinY, double MaxX, double MaxY);

public static class Patterns
{
    public static IReadOnlyList<PatternId> All { get; } =
        [PatternId.Stack, PatternId.Running, PatternId.Herringbone, PatternId.Basketweave];

    public static string Label(this PatternId id) => id switch
    {
        PatternId.Stack => "Stack bond (grid)",
        PatternId.Running => "Running bond",
        PatternId.Herringbone => "Herringbone",
        PatternId.Basketweave => "Basketweave",
        _ => throw new ArgumentOutOfRangeException(nameof(id), id, null),
    };

    /// <summary>Round(Lc / Wc) with JavaScript half-up rounding.</summary>
    public static int RatioK(Paver paver)
    {
        var lc = paver.Length + paver.Joint;
        var wc = paver.Width + paver.Joint;
        return (int)Math.Floor(lc / wc + 0.5);
    }

    /// <summary>Herringbone and basketweave only close up when the long side is a whole multiple (2x, 3x...) of the short.</summary>
    public static bool IsApplicable(PatternId pattern, Paver paver)
    {
        if (pattern is PatternId.Stack or PatternId.Running) return true;
        var lc = paver.Length + paver.Joint;
        var wc = paver.Width + paver.Joint;
        var k = RatioK(paver);
        return k >= 2 && Math.Abs(lc / wc - k) <= 0.03 * k;
    }

    /// <summary>Cells of the pattern (pitch size, joints not yet removed) that touch the box, in pattern space.</summary>
    public static IReadOnlyList<CellRect> GenerateCells(PatternId pattern, Paver paver, BBox box)
    {
        var lc = paver.Length + paver.Joint;
        var wc = paver.Width + paver.Joint;
        var cells = new List<CellRect>();

        void Add(double x, double y, double w, double h)
        {
            if (x < box.MaxX && x + w > box.MinX && y < box.MaxY && y + h > box.MinY)
                cells.Add(new CellRect(x, y, w, h));
        }

        switch (pattern)
        {
            case PatternId.Stack:
                for (var j = (long)Math.Floor(box.MinY / wc) - 1; j <= (long)Math.Ceiling(box.MaxY / wc) + 1; j++)
                    for (var i = (long)Math.Floor(box.MinX / lc) - 1; i <= (long)Math.Ceiling(box.MaxX / lc) + 1; i++)
                        Add(i * lc, j * wc, lc, wc);
                break;

            case PatternId.Running:
                for (var j = (long)Math.Floor(box.MinY / wc) - 1; j <= (long)Math.Ceiling(box.MaxY / wc) + 1; j++)
                {
                    var shift = Math.Abs(j % 2) == 1 ? lc / 2 : 0;
                    for (var i = (long)Math.Floor((box.MinX - shift) / lc) - 1; i <= (long)Math.Ceiling((box.MaxX - shift) / lc) + 1; i++)
                        Add(i * lc + shift, j * wc, lc, wc);
                }
                break;

            case PatternId.Herringbone:
            {
                // lattice u = (wc, wc), v = (-lc, lc); each lattice point holds one horizontal and one vertical stone
                var pad = lc + wc;
                (double X, double Y)[] corners =
                [
                    (box.MinX - pad, box.MinY - pad), (box.MaxX + pad, box.MinY - pad),
                    (box.MinX - pad, box.MaxY + pad), (box.MaxX + pad, box.MaxY + pad),
                ];
                double mMin = double.PositiveInfinity, mMax = double.NegativeInfinity;
                double nMin = double.PositiveInfinity, nMax = double.NegativeInfinity;
                foreach (var (px, py) in corners)
                {
                    var m = (px + py) / (2 * wc);
                    var n = (py - px) / (2 * lc);
                    mMin = Math.Min(mMin, m); mMax = Math.Max(mMax, m);
                    nMin = Math.Min(nMin, n); nMax = Math.Max(nMax, n);
                }
                for (var n = (long)Math.Floor(nMin); n <= (long)Math.Ceiling(nMax); n++)
                {
                    for (var m = (long)Math.Floor(mMin); m <= (long)Math.Ceiling(mMax); m++)
                    {
                        var bx = m * wc - n * lc;
                        var by = m * wc + n * lc;
                        Add(bx, by, lc, wc);
                        Add(bx + lc, by + wc - lc, wc, lc);
                    }
                }
                break;
            }

            case PatternId.Basketweave:
            {
                var k = Math.Max(1, RatioK(paver));
                var strip = lc / k;
                for (var j = (long)Math.Floor(box.MinY / lc) - 1; j <= (long)Math.Ceiling(box.MaxY / lc) + 1; j++)
                {
                    for (var i = (long)Math.Floor(box.MinX / lc) - 1; i <= (long)Math.Ceiling(box.MaxX / lc) + 1; i++)
                    {
                        var horizontal = Math.Abs((i + j) % 2) == 0;
                        for (var s = 0; s < k; s++)
                        {
                            if (horizontal) Add(i * lc, j * lc + s * strip, lc, strip);
                            else Add(i * lc + s * strip, j * lc, strip, lc);
                        }
                    }
                }
                break;
            }
        }
        return cells;
    }
}
