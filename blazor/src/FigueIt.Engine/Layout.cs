using NetTopologySuite.Geometries;
using NetTopologySuite.Geometries.Utilities;

namespace FigueIt.Engine;

public sealed record Placement(
    /// <summary>The whole paver rectangle in shape space (four corners).</summary>
    IReadOnlyList<Pt> Rect,
    /// <summary>The part that lands inside the shape, in shape space (one exterior ring per separate piece).</summary>
    IReadOnlyList<IReadOnlyList<Pt>> Clipped,
    bool Full);

public sealed record Layout(
    bool Applicable,
    int Full,
    int Cut,
    int Total,
    IReadOnlyList<Placement> Placements)
{
    public static Layout NotApplicable { get; } = new(false, 0, 0, 0, []);
}

public sealed record Summary(
    double AreaSqFt,
    double PerimeterIn,
    int Minimum,
    int Full,
    int Cut,
    int Total,
    int Order);

public static class LayoutEngine
{
    private const double FullTolerance = 1e-6;
    private const double MinPieceArea = 0.05; // square inches

    private static readonly GeometryFactory Factory = new();

    private static Pt ToPatternSpace(Pt p, Pt offset, double cos, double sin)
    {
        var dx = p.X - offset.X;
        var dy = p.Y - offset.Y;
        return new Pt(dx * cos + dy * sin, -dx * sin + dy * cos);
    }

    private static Pt ToShapeSpace(double x, double y, Pt offset, double cos, double sin) =>
        new(x * cos - y * sin + offset.X, x * sin + y * cos + offset.Y);

    private static Polygon? BuildTarget(IReadOnlyList<Pt> local)
    {
        var coords = new Coordinate[local.Count + 1];
        for (var i = 0; i < local.Count; i++) coords[i] = new Coordinate(local[i].X, local[i].Y);
        coords[local.Count] = coords[0].Copy();
        Geometry poly = Factory.CreatePolygon(Factory.CreateLinearRing(coords));
        if (!poly.IsValid)
        {
            // self-touching or self-intersecting user polygon: let the buffer(0) trick repair it
            poly = poly.Buffer(0);
            if (poly is MultiPolygon mp)
            {
                // keep the largest piece; a layout of several disjoint areas is not supported
                poly = mp.Geometries.OfType<Polygon>().OrderByDescending(p => p.Area).FirstOrDefault() ?? poly;
            }
        }
        return poly as Polygon is { IsEmpty: false } result ? result : null;
    }

    /// <summary>
    /// Lays the pattern over the shape. <paramref name="shape"/> is a polygon in inches (any orientation);
    /// rotation is in degrees and offset moves the pattern origin, both in shape space.
    /// </summary>
    public static Layout ComputeLayout(IReadOnlyList<Pt> shape, Paver paver, PatternId pattern, double rotationDeg, Pt offset)
    {
        if (!Patterns.IsApplicable(pattern, paver)) return Layout.NotApplicable;

        var rad = rotationDeg * Math.PI / 180;
        var cos = Math.Cos(rad);
        var sin = Math.Sin(rad);

        var local = new Pt[shape.Count];
        double minX = double.PositiveInfinity, minY = double.PositiveInfinity;
        double maxX = double.NegativeInfinity, maxY = double.NegativeInfinity;
        for (var i = 0; i < shape.Count; i++)
        {
            var p = ToPatternSpace(shape[i], offset, cos, sin);
            local[i] = p;
            minX = Math.Min(minX, p.X); maxX = Math.Max(maxX, p.X);
            minY = Math.Min(minY, p.Y); maxY = Math.Max(maxY, p.Y);
        }
        var box = new BBox(minX, minY, maxX, maxY);

        var target = BuildTarget(local);
        if (target is null) return new Layout(true, 0, 0, 0, []);
        var edges = Edges.From(target);
        var half = paver.Joint / 2;

        var placements = new List<Placement>();
        var full = 0;
        var cut = 0;

        foreach (var cell in Patterns.GenerateCells(pattern, paver, box))
        {
            var x0 = cell.X + half;
            var y0 = cell.Y + half;
            var x1 = cell.X + cell.W - half;
            var y1 = cell.Y + cell.H - half;
            // cheap reject against the shape's bounding box before touching NTS
            if (x0 >= box.MaxX || x1 <= box.MinX || y0 >= box.MaxY || y1 <= box.MinY) continue;

            var rectArea = (x1 - x0) * (y1 - y0);
            IReadOnlyList<IReadOnlyList<Pt>> clipped;
            bool isFull;

            // Managed fast path: if no boundary edge passes through the cell, it is wholly inside or wholly outside.
            var relation = edges.Classify(x0, y0, x1, y1);
            if (relation == Relation.Outside) continue;

            if (relation == Relation.Inside)
            {
                isFull = true;
                clipped = [RectRing(x0, y0, x1, y1, offset, cos, sin)];
            }
            else if (edges.IsConvex)
            {
                // convex target: Sutherland-Hodgman against the cell gives the single exact piece without NTS
                var piece = edges.ClipConvex(x0, y0, x1, y1);
                var area = Math.Abs(Shapes.SignedArea(piece));
                isFull = area >= rectArea * (1 - FullTolerance);
                if (!isFull && area < MinPieceArea) continue;
                clipped = isFull
                    ? [RectRing(x0, y0, x1, y1, offset, cos, sin)]
                    : [MapRing(piece, offset, cos, sin)];
            }
            else
            {
                var rectPoly = Factory.CreatePolygon(
                [
                    new Coordinate(x0, y0), new Coordinate(x1, y0), new Coordinate(x1, y1),
                    new Coordinate(x0, y1), new Coordinate(x0, y0),
                ]);
                var inter = rectPoly.Intersection(target);
                var polys = PolygonExtracter.GetPolygons(inter);
                double area = 0;
                foreach (Polygon poly in polys) area += poly.Area;

                isFull = area >= rectArea * (1 - FullTolerance);
                if (!isFull && area < MinPieceArea) continue;

                if (isFull)
                {
                    clipped = [RectRing(x0, y0, x1, y1, offset, cos, sin)];
                }
                else
                {
                    var rings = new List<IReadOnlyList<Pt>>(polys.Count);
                    foreach (Polygon poly in polys) rings.Add(ExteriorRing(poly, offset, cos, sin));
                    clipped = rings;
                }
            }

            if (isFull) full++; else cut++;
            placements.Add(new Placement(RectRing(x0, y0, x1, y1, offset, cos, sin), clipped, isFull));
        }

        return new Layout(true, full, cut, full + cut, placements);
    }

    private static Pt[] RectRing(double x0, double y0, double x1, double y1, Pt offset, double cos, double sin) =>
    [
        ToShapeSpace(x0, y0, offset, cos, sin), ToShapeSpace(x1, y0, offset, cos, sin),
        ToShapeSpace(x1, y1, offset, cos, sin), ToShapeSpace(x0, y1, offset, cos, sin),
    ];

    private static Pt[] MapRing(IReadOnlyList<Pt> ring, Pt offset, double cos, double sin)
    {
        var mapped = new Pt[ring.Count];
        for (var i = 0; i < mapped.Length; i++) mapped[i] = ToShapeSpace(ring[i].X, ring[i].Y, offset, cos, sin);
        if (Shapes.SignedArea(mapped) < 0) Array.Reverse(mapped); // counter-clockwise
        return mapped;
    }

    private static Pt[] ExteriorRing(Polygon poly, Pt offset, double cos, double sin)
    {
        var coords = poly.ExteriorRing.Coordinates;
        var ring = new Pt[coords.Length - 1];
        for (var i = 0; i < ring.Length; i++) ring[i] = ToShapeSpace(coords[i].X, coords[i].Y, offset, cos, sin);
        if (Shapes.SignedArea(ring) < 0) Array.Reverse(ring); // counter-clockwise
        return ring;
    }

    private enum Relation { Inside, Outside, Crossing }

    /// <summary>The target polygon's rings as flat segment arrays, for cheap cell classification.</summary>
    private sealed class Edges
    {
        private const double Shrink = 1e-9;
        private double[] _x1 = [], _y1 = [], _x2 = [], _y2 = [];
        private Pt[] _convex = [];

        /// <summary>True when the target is a single hole-free convex ring (then <see cref="ClipConvex"/> is valid).</summary>
        public bool IsConvex { get; private set; }

        public static Edges From(Polygon polygon)
        {
            var rings = new List<LineString> { polygon.ExteriorRing };
            for (var i = 0; i < polygon.NumInteriorRings; i++) rings.Add(polygon.GetInteriorRingN(i));
            var n = rings.Sum(r => r.NumPoints - 1);
            var e = new Edges { _x1 = new double[n], _y1 = new double[n], _x2 = new double[n], _y2 = new double[n] };
            var k = 0;
            foreach (var ring in rings)
            {
                var c = ring.Coordinates;
                for (var i = 0; i < c.Length - 1; i++, k++)
                {
                    e._x1[k] = c[i].X; e._y1[k] = c[i].Y;
                    e._x2[k] = c[i + 1].X; e._y2[k] = c[i + 1].Y;
                }
            }
            if (polygon.NumInteriorRings == 0)
            {
                var c = polygon.ExteriorRing.Coordinates;
                var pts = new Pt[c.Length - 1];
                for (var i = 0; i < pts.Length; i++) pts[i] = new Pt(c[i].X, c[i].Y);
                if (IsConvexRing(pts))
                {
                    e._convex = pts;
                    e.IsConvex = true;
                }
            }
            return e;
        }

        private static bool IsConvexRing(Pt[] pts)
        {
            if (pts.Length < 3) return false;
            var sign = 0;
            for (var i = 0; i < pts.Length; i++)
            {
                var a = pts[i]; var b = pts[(i + 1) % pts.Length]; var c = pts[(i + 2) % pts.Length];
                var cross = (b.X - a.X) * (c.Y - b.Y) - (b.Y - a.Y) * (c.X - b.X);
                var scale = Math.Abs(b.X - a.X) + Math.Abs(b.Y - a.Y) + Math.Abs(c.X - b.X) + Math.Abs(c.Y - b.Y);
                if (Math.Abs(cross) <= 1e-12 * scale * scale) continue; // collinear vertex
                var s = cross > 0 ? 1 : -1;
                if (sign == 0) sign = s;
                else if (s != sign) return false;
            }
            return sign != 0;
        }

        /// <summary>Sutherland-Hodgman clip of the convex target to an axis-aligned cell.</summary>
        public Pt[] ClipConvex(double x0, double y0, double x1, double y1)
        {
            var cur = new List<Pt>(_convex);
            var next = new List<Pt>(cur.Count + 4);
            for (var edge = 0; edge < 4 && cur.Count > 0; edge++)
            {
                next.Clear();
                for (var i = 0; i < cur.Count; i++)
                {
                    var a = cur[i];
                    var b = cur[(i + 1) % cur.Count];
                    var da = Signed(edge, a, x0, y0, x1, y1);
                    var db = Signed(edge, b, x0, y0, x1, y1);
                    if (da >= 0) next.Add(a);
                    if ((da >= 0) != (db >= 0))
                    {
                        var t = da / (da - db);
                        next.Add(new Pt(a.X + t * (b.X - a.X), a.Y + t * (b.Y - a.Y)));
                    }
                }
                (cur, next) = (next, cur);
            }
            return [.. cur];
        }

        // positive when the point is on the inner side of the given cell edge
        private static double Signed(int edge, Pt p, double x0, double y0, double x1, double y1) => edge switch
        {
            0 => p.X - x0,
            1 => x1 - p.X,
            2 => p.Y - y0,
            _ => y1 - p.Y,
        };

        public Relation Classify(double x0, double y0, double x1, double y1)
        {
            // shrink slightly so edges lying along the cell border do not count as crossing
            var lx = x0 + Shrink; var hx = x1 - Shrink;
            var ly = y0 + Shrink; var hy = y1 - Shrink;
            for (var i = 0; i < _x1.Length; i++)
                if (SegmentTouchesBox(_x1[i], _y1[i], _x2[i], _y2[i], lx, ly, hx, hy)) return Relation.Crossing;

            // no edge enters the cell, so one point decides: even-odd test of the centre
            double cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
            var inside = false;
            for (var i = 0; i < _x1.Length; i++)
            {
                var ay = _y1[i]; var by = _y2[i];
                if ((ay > cy) == (by > cy)) continue;
                var xAt = _x1[i] + (cy - ay) / (by - ay) * (_x2[i] - _x1[i]);
                if (xAt > cx) inside = !inside;
            }
            return inside ? Relation.Inside : Relation.Outside;
        }

        /// <summary>Liang-Barsky: does the closed segment meet the closed box?</summary>
        private static bool SegmentTouchesBox(double ax, double ay, double bx, double by, double lx, double ly, double hx, double hy)
        {
            if ((ax < lx && bx < lx) || (ax > hx && bx > hx) || (ay < ly && by < ly) || (ay > hy && by > hy)) return false;
            double t0 = 0, t1 = 1;
            var dx = bx - ax; var dy = by - ay;
            return Clip(-dx, ax - lx, ref t0, ref t1) && Clip(dx, hx - ax, ref t0, ref t1)
                && Clip(-dy, ay - ly, ref t0, ref t1) && Clip(dy, hy - ay, ref t0, ref t1);
        }

        private static bool Clip(double p, double q, ref double t0, ref double t1)
        {
            if (p == 0) return q >= 0;
            var r = q / p;
            if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
            else { if (r < t0) return false; if (r < t1) t1 = r; }
            return true;
        }
    }

    public static Summary Summarize(double areaSqIn, double perimeterIn, Paver paver, Layout layout, double wastePercent) =>
        new(
            AreaSqFt: areaSqIn / 144,
            PerimeterIn: perimeterIn,
            Minimum: (int)Math.Ceiling(areaSqIn / (paver.Length * paver.Width) - 1e-9),
            Full: layout.Full,
            Cut: layout.Cut,
            Total: layout.Total,
            Order: (int)Math.Ceiling(layout.Total * (1 + wastePercent / 100) - 1e-9));
}
