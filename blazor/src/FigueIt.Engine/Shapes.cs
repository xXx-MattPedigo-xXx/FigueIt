namespace FigueIt.Engine;

/// <summary>A point in inches.</summary>
public readonly record struct Pt(double X, double Y);

/// <summary>Shape definition. Rectangle/Triangle/LShape/Trapezoid hold length strings (default unit ft).</summary>
public abstract record ShapeSpec;

public sealed record RectangleSpec(string W, string H) : ShapeSpec;

public sealed record TriangleSpec(string A, string B, string C) : ShapeSpec;

/// <summary>Rectangle W x H with an Nw x Nh notch removed from the top-right corner.</summary>
public sealed record LShapeSpec(string W, string H, string Nw, string Nh) : ShapeSpec;

public sealed record TrapezoidSpec(string B1, string B2, string H) : ShapeSpec;

/// <summary>Points directly in inches.</summary>
public sealed record PolygonSpec(IReadOnlyList<Pt> Points) : ShapeSpec;

public static class Shapes
{
    public static double SignedArea(IReadOnlyList<Pt> poly)
    {
        double sum = 0;
        for (var i = 0; i < poly.Count; i++)
        {
            var a = poly[i];
            var b = poly[(i + 1) % poly.Count];
            sum += a.X * b.Y - b.X * a.Y;
        }
        return sum / 2;
    }

    public static double Perimeter(IReadOnlyList<Pt> poly)
    {
        double sum = 0;
        for (var i = 0; i < poly.Count; i++)
        {
            var a = poly[i];
            var b = poly[(i + 1) % poly.Count];
            sum += Math.Sqrt((b.X - a.X) * (b.X - a.X) + (b.Y - a.Y) * (b.Y - a.Y));
        }
        return sum;
    }

    /// <summary>
    /// True when the closed outline has at least 3 points and no two edges cross, touch or overlap
    /// (adjacent edges may only share their common vertex). Used to reject self-intersecting custom polygons.
    /// </summary>
    public static bool IsSimple(IReadOnlyList<Pt> poly)
    {
        var n = poly.Count;
        if (n < 3) return false;
        for (var i = 0; i < n; i++)
        {
            var a = poly[i];
            var b = poly[(i + 1) % n];
            if (a == b) return false; // zero-length edge
            for (var j = i + 1; j < n; j++)
            {
                var c = poly[j];
                var d = poly[(j + 1) % n];
                var adjacent = j == i + 1 || (i == 0 && j == n - 1);
                if (adjacent)
                {
                    // edges share one vertex; they must not fold back on each other
                    var cross = (b.X - a.X) * (d.Y - c.Y) - (b.Y - a.Y) * (d.X - c.X);
                    if (Math.Abs(cross) < 1e-9 && (b.X - a.X) * (d.X - c.X) + (b.Y - a.Y) * (d.Y - c.Y) < 0) return false;
                }
                else if (SegmentsIntersect(a, b, c, d))
                {
                    return false;
                }
            }
        }
        return true;
    }

    private static double Orient(Pt a, Pt b, Pt c) => (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);

    private static bool OnSegment(Pt a, Pt b, Pt p) =>
        Math.Min(a.X, b.X) <= p.X && p.X <= Math.Max(a.X, b.X) &&
        Math.Min(a.Y, b.Y) <= p.Y && p.Y <= Math.Max(a.Y, b.Y);

    private static bool SegmentsIntersect(Pt a, Pt b, Pt c, Pt d)
    {
        var o1 = Orient(a, b, c);
        var o2 = Orient(a, b, d);
        var o3 = Orient(c, d, a);
        var o4 = Orient(c, d, b);
        if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
        // touching / collinear cases
        return (o1 == 0 && OnSegment(a, b, c)) || (o2 == 0 && OnSegment(a, b, d))
            || (o3 == 0 && OnSegment(c, d, a)) || (o4 == 0 && OnSegment(c, d, b));
    }

    private static double? Len(string text)
    {
        var v = Units.ParseLength(text, Unit.Ft);
        return v is > 0 ? v : null;
    }

    /// <summary>Builds a counter-clockwise polygon in inches, or null if the dimensions are missing or impossible.</summary>
    public static IReadOnlyList<Pt>? BuildShape(ShapeSpec spec)
    {
        List<Pt> poly;
        switch (spec)
        {
            case RectangleSpec r:
            {
                if (Len(r.W) is not { } w || Len(r.H) is not { } h) return null;
                poly = [new(0, 0), new(w, 0), new(w, h), new(0, h)];
                break;
            }
            case TriangleSpec t:
            {
                if (Len(t.A) is not { } a || Len(t.B) is not { } b || Len(t.C) is not { } c) return null;
                if (a + b <= c || a + c <= b || b + c <= a) return null;
                var x = (b * b + c * c - a * a) / (2 * c);
                var y = Math.Sqrt(Math.Max(0, b * b - x * x));
                poly = [new(0, 0), new(c, 0), new(x, y)];
                break;
            }
            case LShapeSpec l:
            {
                if (Len(l.W) is not { } w || Len(l.H) is not { } h || Len(l.Nw) is not { } nw || Len(l.Nh) is not { } nh) return null;
                if (nw >= w || nh >= h) return null;
                poly = [new(0, 0), new(w, 0), new(w, h - nh), new(w - nw, h - nh), new(w - nw, h), new(0, h)];
                break;
            }
            case TrapezoidSpec z:
            {
                if (Len(z.B1) is not { } b1 || Len(z.B2) is not { } b2 || Len(z.H) is not { } h) return null;
                poly = [new(0, 0), new(b1, 0), new((b1 + b2) / 2, h), new((b1 - b2) / 2, h)];
                break;
            }
            case PolygonSpec p:
            {
                if (p.Points.Count < 3) return null;
                poly = [.. p.Points];
                break;
            }
            default:
                return null;
        }
        var area = SignedArea(poly);
        if (Math.Abs(area) < 1e-9) return null;
        if (area < 0) poly.Reverse();
        return poly;
    }
}
