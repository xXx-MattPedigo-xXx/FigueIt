using System.Text.Json;
using FigueIt.Engine;

namespace FigueIt.Engine.Tests;

internal static class SpecFile
{
    private static readonly Lazy<JsonElement> Root = new(() =>
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "shared", "spec.json");
            if (File.Exists(candidate))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(candidate));
                return doc.RootElement.Clone();
            }
            dir = dir.Parent;
        }
        throw new FileNotFoundException("Could not find shared\\spec.json above " + AppContext.BaseDirectory);
    });

    public static JsonElement Section(string name) => Root.Value.GetProperty(name);

    public static TheoryData<int> Indices(string section)
    {
        var data = new TheoryData<int>();
        var n = Section(section).GetArrayLength();
        for (var i = 0; i < n; i++) data.Add(i);
        return data;
    }

    public static JsonElement Case(string section, int i) => Section(section)[i];

    public static PatternId Pattern(string id) => id switch
    {
        "stack" => PatternId.Stack,
        "running" => PatternId.Running,
        "herringbone" => PatternId.Herringbone,
        "basketweave" => PatternId.Basketweave,
        _ => throw new ArgumentException("unknown pattern " + id),
    };

    public static Paver Paver(JsonElement e) =>
        new(e.GetProperty("length").GetDouble(), e.GetProperty("width").GetDouble(), e.GetProperty("joint").GetDouble());

    public static ShapeSpec Shape(JsonElement e)
    {
        string S(string p) => e.GetProperty(p).GetString()!;
        return e.GetProperty("type").GetString() switch
        {
            "rectangle" => new RectangleSpec(S("w"), S("h")),
            "triangle" => new TriangleSpec(S("a"), S("b"), S("c")),
            "lshape" => new LShapeSpec(S("w"), S("h"), S("nw"), S("nh")),
            "trapezoid" => new TrapezoidSpec(S("b1"), S("b2"), S("h")),
            "polygon" => new PolygonSpec(
                e.GetProperty("points").EnumerateArray()
                    .Select(p => new Pt(p[0].GetDouble(), p[1].GetDouble())).ToList()),
            var t => throw new ArgumentException("unknown shape type " + t),
        };
    }
}

public class ParseLengthTests
{
    public static TheoryData<int> Cases => SpecFile.Indices("parse");

    [Theory]
    [MemberData(nameof(Cases))]
    public void MatchesSpec(int index)
    {
        var c = SpecFile.Case("parse", index);
        var input = c.GetProperty("input").GetString()!;
        var unit = c.GetProperty("defaultUnit").GetString() == "ft" ? Unit.Ft : Unit.In;
        var got = Units.ParseLength(input, unit);
        var expected = c.GetProperty("inches");
        if (expected.ValueKind == JsonValueKind.Null)
        {
            Assert.Null(got);
        }
        else
        {
            Assert.NotNull(got);
            Assert.Equal(expected.GetDouble(), got.Value, 6);
        }
    }
}

public class FormatTests
{
    [Theory]
    [InlineData(150.5, "12' 6 1/2\"")]
    [InlineData(150, "12' 6\"")]
    [InlineData(144, "12'")]
    [InlineData(0.375, "3/8\"")]
    [InlineData(4.5, "4 1/2\"")]
    [InlineData(0, "0\"")]
    [InlineData(95.99, "8'")]
    [InlineData(0.0625, "1/8\"")] // exactly halfway rounds up, like JS Math.round
    [InlineData(12.01, "1'")]
    public void FormatLength(double inches, string expected) => Assert.Equal(expected, Units.FormatLength(inches));

    [Fact]
    public void FormatSqFt()
    {
        Assert.Equal("1.00", Units.FormatSqFt(144));
        Assert.Equal("1,234.50", Units.FormatSqFt(1234.5 * 144));
    }
}

public class ShapeTests
{
    public static TheoryData<int> Cases => SpecFile.Indices("shapes");

    [Theory]
    [MemberData(nameof(Cases))]
    public void MatchesSpec(int index)
    {
        var c = SpecFile.Case("shapes", index);
        var poly = Shapes.BuildShape(SpecFile.Shape(c.GetProperty("shape")));
        if (c.TryGetProperty("invalid", out var inv) && inv.GetBoolean())
        {
            Assert.Null(poly);
            return;
        }
        Assert.NotNull(poly);
        Assert.Equal(c.GetProperty("areaSqFt").GetDouble(), Shapes.SignedArea(poly) / 144, 6);
        var per = c.GetProperty("perimeterIn");
        if (per.ValueKind != JsonValueKind.Null)
            Assert.Equal(per.GetDouble(), Shapes.Perimeter(poly), 6);
    }
}

public class LayoutSpecTests
{
    public static TheoryData<int> Cases => SpecFile.Indices("layouts");

    [Theory]
    [MemberData(nameof(Cases))]
    public void MatchesSpec(int index)
    {
        var c = SpecFile.Case("layouts", index);
        var poly = Shapes.BuildShape(SpecFile.Shape(c.GetProperty("shape")))!;
        var off = c.GetProperty("offset");
        var layout = LayoutEngine.ComputeLayout(
            poly,
            SpecFile.Paver(c.GetProperty("paver")),
            SpecFile.Pattern(c.GetProperty("pattern").GetString()!),
            c.GetProperty("rotation").GetDouble(),
            new Pt(off[0].GetDouble(), off[1].GetDouble()));
        Assert.True(layout.Applicable);
        Assert.Equal((c.GetProperty("full").GetInt32(), c.GetProperty("cut").GetInt32()), (layout.Full, layout.Cut));
        Assert.Equal(layout.Full + layout.Cut, layout.Total);
        Assert.Equal(layout.Total, layout.Placements.Count);
    }
}

public class ApplicabilityTests
{
    public static TheoryData<int> Cases => SpecFile.Indices("applicability");

    [Theory]
    [MemberData(nameof(Cases))]
    public void MatchesSpec(int index)
    {
        var c = SpecFile.Case("applicability", index);
        var pattern = SpecFile.Pattern(c.GetProperty("pattern").GetString()!);
        var paver = SpecFile.Paver(c.GetProperty("paver"));
        Assert.Equal(c.GetProperty("applicable").GetBoolean(), Patterns.IsApplicable(pattern, paver));
    }

    [Fact]
    public void NotApplicableLayoutIsEmpty()
    {
        var poly = Shapes.BuildShape(new RectangleSpec("10'", "10'"))!;
        var layout = LayoutEngine.ComputeLayout(poly, new Paver(12, 12, 0), PatternId.Herringbone, 0, new Pt(0, 0));
        Assert.False(layout.Applicable);
        Assert.Equal(0, layout.Total);
        Assert.Empty(layout.Placements);
    }

    [Fact]
    public void RatioKRoundsHalfUp()
    {
        // 6/4 = 1.5 -> JS Math.round gives 2 (banker's rounding would also give 2); 10/4 = 2.5 -> 3 (banker's gives 2)
        Assert.Equal(3, Patterns.RatioK(new Paver(10, 4, 0)));
        Assert.Equal(2, Patterns.RatioK(new Paver(6, 4, 0)));
    }

    [Fact]
    public void PatternLabels()
    {
        Assert.Equal("Stack bond (grid)", PatternId.Stack.Label());
        Assert.Equal("Running bond", PatternId.Running.Label());
        Assert.Equal("Herringbone", PatternId.Herringbone.Label());
        Assert.Equal("Basketweave", PatternId.Basketweave.Label());
    }
}

public class PatternTilingTests
{
    private static double FilledArea(IEnumerable<CellRect> cells, BBox box)
    {
        double area = 0;
        foreach (var r in cells)
        {
            var w = Math.Min(r.X + r.W, box.MaxX) - Math.Max(r.X, box.MinX);
            var h = Math.Min(r.Y + r.H, box.MaxY) - Math.Max(r.Y, box.MinY);
            area += Math.Max(0, w) * Math.Max(0, h);
        }
        return area;
    }

    [Theory]
    [InlineData(PatternId.Stack)]
    [InlineData(PatternId.Running)]
    [InlineData(PatternId.Herringbone)]
    [InlineData(PatternId.Basketweave)]
    public void CellsNeverOverlapAndFillTheBox(PatternId pattern)
    {
        var box = new BBox(0, 0, 96, 96);
        var cells = Patterns.GenerateCells(pattern, new Paver(8, 4, 0), box);
        Assert.Equal(96 * 96, FilledArea(cells, box), 6);
    }

    [Fact]
    public void HerringboneAlsoTilesFor3To1Pavers()
    {
        var box = new BBox(0, 0, 120, 120);
        var cells = Patterns.GenerateCells(PatternId.Herringbone, new Paver(12, 4, 0), box);
        Assert.Equal(120 * 120, FilledArea(cells, box), 6);
    }
}

public class RotationTests
{
    [Fact]
    public void AreaIsConservedAcrossPatternsAndRotations()
    {
        var poly = Shapes.BuildShape(new LShapeSpec("20'", "15'", "8'", "6'"))!;
        var paver = new Paver(8, 4, 0);
        var shapeArea = Shapes.SignedArea(poly);
        foreach (var pattern in Patterns.All)
        {
            foreach (var rotation in new[] { 0, 15, 45 })
            {
                var layout = LayoutEngine.ComputeLayout(poly, paver, pattern, rotation, new Pt(0, 0));
                var area = layout.Placements.Sum(p => p.Clipped.Sum(ring => Math.Abs(Shapes.SignedArea(ring))));
                // slivers under 0.05 sq in are deliberately ignored: a little shortfall is fine, never an excess
                Assert.True(area <= shapeArea + 1e-3, $"{pattern} @ {rotation}: {area} > {shapeArea}");
                Assert.True(shapeArea - area < 0.5, $"{pattern} @ {rotation}: shortfall {shapeArea - area}");
            }
        }
    }

    [Fact]
    public void ClippedRingsAreCounterClockwiseAndFullFlagMatches()
    {
        var poly = Shapes.BuildShape(new TriangleSpec("5'", "3'", "4'"))!;
        var layout = LayoutEngine.ComputeLayout(poly, new Paver(12, 12, 0), PatternId.Stack, 30, new Pt(7, 3));
        Assert.All(layout.Placements, p =>
        {
            Assert.Equal(4, p.Rect.Count);
            Assert.NotEmpty(p.Clipped);
            Assert.All(p.Clipped, ring => Assert.True(Shapes.SignedArea(ring) > 0));
            if (p.Full) Assert.Equal(144, Shapes.SignedArea(p.Rect), 6);
        });
    }
}

public class SummaryTests
{
    [Fact]
    public void MinimumAndOrderUseCeilingWithGuard()
    {
        var poly = Shapes.BuildShape(new RectangleSpec("12'", "8'"))!;
        var paver = new Paver(12, 12, 0);
        var layout = LayoutEngine.ComputeLayout(poly, paver, PatternId.Stack, 0, new Pt(0, 0));
        var s = LayoutEngine.Summarize(Shapes.SignedArea(poly), Shapes.Perimeter(poly), paver, layout, 10);
        Assert.Equal(96, s.AreaSqFt);
        Assert.Equal(480, s.PerimeterIn);
        Assert.Equal(96, s.Minimum);   // not 97: the 1e-9 guard absorbs float noise
        Assert.Equal(96, s.Total);
        Assert.Equal(106, s.Order);    // 96 * 1.10 = 105.6 -> 106
        var zeroWaste = LayoutEngine.Summarize(Shapes.SignedArea(poly), Shapes.Perimeter(poly), paver, layout, 0);
        Assert.Equal(96, zeroWaste.Order);
    }
}

public class PerformanceTests
{
    [Fact]
    public void ThreeThousandPaversAllPatternsIsFast()
    {
        var poly = Shapes.BuildShape(new RectangleSpec("30'", "22'"))!; // ~3,000 8x4 pavers
        var paver = new Paver(8, 4, 0.125);
        // warm up JIT
        LayoutEngine.ComputeLayout(poly, paver, PatternId.Stack, 0, new Pt(0, 0));
        foreach (var pattern in Patterns.All) LayoutEngine.ComputeLayout(poly, paver, pattern, 15, new Pt(3, 5));
        var sw = System.Diagnostics.Stopwatch.StartNew();
        foreach (var pattern in Patterns.All)
        {
            var t0 = sw.ElapsedMilliseconds;
            var layout = LayoutEngine.ComputeLayout(poly, paver, pattern, 15, new Pt(3, 5));
            Console.WriteLine($"{pattern}: {sw.ElapsedMilliseconds - t0} ms, {layout.Total} pavers, {layout.Cut} cut");
            Assert.True(layout.Total > 2500, $"{pattern}: {layout.Total}");
        }
        sw.Stop();
        Console.WriteLine($"4 patterns, ~3000 pavers, rotated: {sw.ElapsedMilliseconds} ms");
        Assert.True(sw.ElapsedMilliseconds < 2000, $"took {sw.ElapsedMilliseconds} ms");
    }
}

public class ClippingCrossCheckTests
{
    private static NetTopologySuite.Geometries.Polygon ToNts(IReadOnlyList<Pt> ring)
    {
        var f = new NetTopologySuite.Geometries.GeometryFactory();
        var coords = ring.Select(p => new NetTopologySuite.Geometries.Coordinate(p.X, p.Y)).ToList();
        coords.Add(coords[0].Copy());
        return f.CreatePolygon(coords.ToArray());
    }

    [Theory]
    [InlineData("trapezoid", PatternId.Running, 30)]      // convex: managed clip path
    [InlineData("trapezoid", PatternId.Herringbone, 12)]
    [InlineData("triangle", PatternId.Basketweave, 45)]
    [InlineData("lshape", PatternId.Herringbone, 20)]     // concave: NTS path
    [InlineData("lshape", PatternId.Stack, 7)]
    public void ClippedAreaMatchesIndependentNtsIntersection(string shapeName, PatternId pattern, double rotation)
    {
        ShapeSpec spec = shapeName switch
        {
            "trapezoid" => new TrapezoidSpec("14'", "9'", "8'"),
            "triangle" => new TriangleSpec("13'", "12'", "5'"),
            _ => new LShapeSpec("16'", "12'", "6'", "5'"),
        };
        var poly = Shapes.BuildShape(spec)!;
        var shape = ToNts(poly);
        var layout = LayoutEngine.ComputeLayout(poly, new Paver(8, 4, 0.25), pattern, rotation, new Pt(2.5, 1.5));
        Assert.True(layout.Total > 20);
        double clippedTotal = 0;
        foreach (var p in layout.Placements)
        {
            var expected = ToNts(p.Rect).Intersection(shape).Area;
            var got = p.Clipped.Sum(r => Math.Abs(Shapes.SignedArea(r)));
            Assert.Equal(expected, got, 6);
            Assert.Equal(p.Full, got >= Math.Abs(Shapes.SignedArea(p.Rect)) * (1 - 1e-6));
            clippedTotal += got;
        }
        Assert.True(clippedTotal <= Shapes.SignedArea(poly) + 1e-3);
    }
}
