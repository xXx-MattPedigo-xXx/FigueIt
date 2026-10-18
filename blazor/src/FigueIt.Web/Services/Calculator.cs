using System.Globalization;
using FigueIt.Engine;
using FigueIt.Web.Models;

namespace FigueIt.Web.Services;

/// <summary>What is wrong (or right) with the current inputs. Built on every edit, cheap to compute.</summary>
public sealed class Evaluation
{
    /// <summary>Per-field problems, keyed by field id. An empty message means "highlight the field, say nothing".</summary>
    public Dictionary<string, string> Errors { get; } = [];

    /// <summary>A problem with the shape as a whole, such as "sides can't form a triangle".</summary>
    public string? Message { get; set; }

    /// <summary>Neutral guidance (not an error), such as "add at least 3 points".</summary>
    public string? Hint { get; set; }

    /// <summary>Some shape field is still empty, so there is no shape yet. That is not an error.</summary>
    public bool Incomplete { get; set; }

    /// <summary>A shape field holds a mistake (as opposed to just being empty).</summary>
    public bool ShapeHasError { get; set; }

    public IReadOnlyList<Pt>? Shape { get; set; }
    public Paver? Paver { get; set; }

    public bool Valid => Errors.Count == 0 && Message is null && Shape is not null && Paver is not null;

    public string? ErrorFor(string key) => Errors.GetValueOrDefault(key);
}

/// <summary>
/// One set of valid inputs plus the layouts computed for it so far. Layouts are computed on demand and cached,
/// so changing only the pattern or the waste never reruns the engine for a pattern that is already done.
/// </summary>
public sealed class Snapshot
{
    private readonly Dictionary<PatternId, Layout> _layouts = [];

    public required IReadOnlyList<Pt> Shape { get; init; }
    public required Paver Paver { get; init; }
    public required double Rotation { get; init; }
    public required Pt Offset { get; init; }
    public required double AreaSqIn { get; init; }
    public required double PerimeterIn { get; init; }

    /// <summary>Non-zero when the shape would need so many pavers that counting and drawing them is not sensible.</summary>
    public int TooLargeEstimate { get; init; }

    public bool HasLayout(PatternId id) => _layouts.ContainsKey(id);

    public bool AllLayoutsReady => TooLargeEstimate > 0 || Patterns.All.All(HasLayout);

    /// <summary>The layout for a pattern, running the engine the first time it is asked for.</summary>
    public Layout GetLayout(PatternId id)
    {
        if (!_layouts.TryGetValue(id, out var layout))
        {
            layout = LayoutEngine.ComputeLayout(Shape, Paver, id, Rotation, Offset);
            _layouts[id] = layout;
        }
        return layout;
    }

    public Layout? LayoutIfReady(PatternId id) => _layouts.GetValueOrDefault(id);

    public bool Matches(IReadOnlyList<Pt> shape, Paver paver, double rotation, Pt offset) =>
        Paver == paver && Rotation == rotation && Offset == offset && Shape.SequenceEqual(shape);
}

public sealed record PatternRow(PatternId Id, Summary Summary, bool IsBest);

public static class Calculator
{
    public const int MaxPavers = 30_000;

    public static Evaluation Evaluate(AppState s)
    {
        var ev = new Evaluation();
        EvaluatePaver(s, ev);
        EvaluateShape(s, ev);

        if (!double.IsFinite(s.Rotation)) ev.Errors["rotation"] = "";
        if (!double.IsFinite(s.OffsetX)) ev.Errors["offsetX"] = "";
        if (!double.IsFinite(s.OffsetY)) ev.Errors["offsetY"] = "";
        if (!double.IsFinite(s.WastePercent) || s.WastePercent < 0) ev.Errors["waste"] = "0 or more";
        return ev;
    }

    private static double? Parse(Evaluation ev, string key, string text, Unit unit, bool allowZero = false, bool emptyOk = false)
    {
        if (emptyOk && string.IsNullOrWhiteSpace(text)) { ev.Incomplete = true; return null; }
        var v = Units.ParseLength(text, unit);
        if (v is null) { ev.Errors[key] = "not a valid length"; return null; }
        if (v == 0 && !allowZero) { ev.Errors[key] = "must be more than zero"; return null; }
        return v;
    }

    private static void EvaluatePaver(AppState s, Evaluation ev)
    {
        var length = Parse(ev, "paver.length", s.PaverLength, Unit.In);
        var width = Parse(ev, "paver.width", s.PaverWidth, Unit.In);
        var joint = Parse(ev, "paver.joint", s.Joint, Unit.In, allowZero: true);
        if (length is { } l && width is { } w && joint is { } j) ev.Paver = new Paver(l, w, j);
    }

    private static void EvaluateShape(AppState s, Evaluation ev)
    {
        var errorsBefore = ev.Errors.Count;
        ShapeSpec? spec = null;

        switch (s.Kind)
        {
            case ShapeKind.Rectangle:
                Parse(ev, "rect.w", s.RectW, Unit.Ft, emptyOk: true);
                Parse(ev, "rect.h", s.RectH, Unit.Ft, emptyOk: true);
                if (ev.Errors.Count == errorsBefore && !ev.Incomplete) spec = new RectangleSpec(s.RectW, s.RectH);
                break;

            case ShapeKind.Triangle:
            {
                var a = Parse(ev, "tri.a", s.TriA, Unit.Ft, emptyOk: true);
                var b = Parse(ev, "tri.b", s.TriB, Unit.Ft, emptyOk: true);
                var c = Parse(ev, "tri.c", s.TriC, Unit.Ft, emptyOk: true);
                if (a is not { } x || b is not { } y || c is not { } z) break;
                if (x + y <= z || x + z <= y || y + z <= x)
                {
                    ev.Message = "sides can't form a triangle";
                    ev.Errors["tri.a"] = ev.Errors["tri.b"] = ev.Errors["tri.c"] = "";
                }
                else spec = new TriangleSpec(s.TriA, s.TriB, s.TriC);
                break;
            }

            case ShapeKind.LShape:
            {
                var w = Parse(ev, "l.w", s.LW, Unit.Ft, emptyOk: true);
                var h = Parse(ev, "l.h", s.LH, Unit.Ft, emptyOk: true);
                var nw = Parse(ev, "l.nw", s.LNotchW, Unit.Ft, emptyOk: true);
                var nh = Parse(ev, "l.nh", s.LNotchH, Unit.Ft, emptyOk: true);
                if (w is { } W && nw is { } NW && NW >= W) ev.Errors["l.nw"] = "must be narrower than the width";
                if (h is { } H && nh is { } NH && NH >= H) ev.Errors["l.nh"] = "must be shorter than the height";
                if (ev.Errors.Count == errorsBefore && !ev.Incomplete) spec = new LShapeSpec(s.LW, s.LH, s.LNotchW, s.LNotchH);
                break;
            }

            case ShapeKind.Trapezoid:
                Parse(ev, "trap.bottom", s.TrapBottom, Unit.Ft, emptyOk: true);
                Parse(ev, "trap.top", s.TrapTop, Unit.Ft, emptyOk: true);
                Parse(ev, "trap.h", s.TrapH, Unit.Ft, emptyOk: true);
                if (ev.Errors.Count == errorsBefore && !ev.Incomplete) spec = new TrapezoidSpec(s.TrapBottom, s.TrapTop, s.TrapH);
                break;

            case ShapeKind.Polygon:
                if (!s.Closed || s.Points.Count < 3)
                {
                    ev.Hint = s.Points.Count < 3
                        ? "Click the drawing to add points (at least 3)."
                        : "Click the first point or press Close shape to finish.";
                }
                else if (!Shapes.IsSimple(s.Points)) ev.Message = "edges cross - move a point";
                else spec = new PolygonSpec(s.Points);
                break;
        }

        if (spec is not null)
        {
            ev.Shape = Shapes.BuildShape(spec);
            if (ev.Shape is null) ev.Message = "that shape has no area";
        }

        ev.ShapeHasError = ev.Message is not null || ev.Errors.Count > errorsBefore;
    }

    /// <summary>
    /// The snapshot for the current inputs: <paramref name="previous"/> itself when only the pattern or waste changed,
    /// otherwise a new one with no layouts computed yet.
    /// </summary>
    public static Snapshot CreateSnapshot(Evaluation ev, AppState s, Snapshot? previous)
    {
        var shape = ev.Shape!;
        var paver = ev.Paver!.Value;
        var offset = new Pt(s.OffsetX, s.OffsetY);
        if (previous is not null && previous.Matches(shape, paver, s.Rotation, offset)) return previous;

        var area = Math.Abs(Shapes.SignedArea(shape));
        var estimate = (int)Math.Min(int.MaxValue, area / (paver.Length * paver.Width));
        return new Snapshot
        {
            Shape = shape,
            Paver = paver,
            Rotation = s.Rotation,
            Offset = offset,
            AreaSqIn = area,
            PerimeterIn = Shapes.Perimeter(shape),
            TooLargeEstimate = estimate > MaxPavers ? estimate : 0,
        };
    }

    public static Summary SummaryFor(Snapshot snap, PatternId id, double wastePercent) =>
        LayoutEngine.Summarize(snap.AreaSqIn, snap.PerimeterIn, snap.Paver, snap.GetLayout(id), wastePercent);

    /// <summary>One row per applicable pattern; the lowest order quantity is flagged as best (the first one wins a tie).</summary>
    public static List<PatternRow> Rows(Snapshot snap, double wastePercent)
    {
        var summaries = new List<(PatternId Id, Summary Summary)>();
        foreach (var id in Patterns.All)
            if (snap.LayoutIfReady(id) is { Applicable: true })
                summaries.Add((id, SummaryFor(snap, id, wastePercent)));

        var best = summaries.Count == 0 ? (PatternId?)null : summaries.MinBy(r => r.Summary.Order).Id;
        return [.. summaries.Select(r => new PatternRow(r.Id, r.Summary, r.Id == best))];
    }
}

public static class Format
{
    private static readonly CultureInfo Us = CultureInfo.InvariantCulture;

    /// <summary>1234 -> 1,234</summary>
    public static string Count(int n) => n.ToString("N0", Us);

    /// <summary>1234.5 -> 1,234.50</summary>
    public static string Decimal2(double v) => v.ToString("N2", Us);

    public static string SqM(double sqFt) => Decimal2(sqFt * 0.09290304);
}
