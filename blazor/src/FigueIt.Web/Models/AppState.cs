using FigueIt.Engine;

namespace FigueIt.Web.Models;

public enum ShapeKind { Rectangle, Triangle, LShape, Trapezoid, Polygon }

/// <summary>
/// Everything the user can edit. This is the object saved to localStorage, so it holds only plain values.
/// Length fields stay as the text the user typed; the engine parses them.
/// </summary>
public sealed class AppState
{
    public ShapeKind Kind { get; set; } = ShapeKind.Polygon;

    // shape fields (feet by default); empty means "not entered yet"
    public string RectW { get; set; } = "";
    public string RectH { get; set; } = "";
    public string TriA { get; set; } = "";
    public string TriB { get; set; } = "";
    public string TriC { get; set; } = "";
    public string LW { get; set; } = "";
    public string LH { get; set; } = "";
    public string LNotchW { get; set; } = "";
    public string LNotchH { get; set; } = "";
    public string TrapBottom { get; set; } = "";
    public string TrapTop { get; set; } = "";
    public string TrapH { get; set; } = "";

    // custom polygon, in inches
    public List<Pt> Points { get; set; } = [];
    public bool Closed { get; set; }

    // paver fields (inches by default)
    public string PaverPreset { get; set; } = "4x8 brick";
    public string PaverLength { get; set; } = "8";
    public string PaverWidth { get; set; } = "4";
    public string Joint { get; set; } = "1/8";

    public PatternId Pattern { get; set; } = PatternId.Herringbone;
    public double Rotation { get; set; }
    public double OffsetX { get; set; }
    public double OffsetY { get; set; }
    public double WastePercent { get; set; } = 10;

    /// <summary>
    /// Picks a shape type from the selector. Each EMPTY field of that type gets its example value and any field that
    /// already has text keeps it, so a shape appears at once (or the normal field error does, if the kept values and
    /// the examples clash) and the user edits from there. Other types' fields are never touched, and switching to
    /// Custom polygon keeps the points already drawn.
    /// </summary>
    public void SwitchKind(ShapeKind kind)
    {
        Kind = kind;
        switch (kind)
        {
            case ShapeKind.Rectangle:
                RectW = Fill(RectW, ShapeExamples.RectW);
                RectH = Fill(RectH, ShapeExamples.RectH);
                break;
            case ShapeKind.Triangle:
                TriA = Fill(TriA, ShapeExamples.TriA);
                TriB = Fill(TriB, ShapeExamples.TriB);
                TriC = Fill(TriC, ShapeExamples.TriC);
                break;
            case ShapeKind.LShape:
                LW = Fill(LW, ShapeExamples.LW);
                LH = Fill(LH, ShapeExamples.LH);
                LNotchW = Fill(LNotchW, ShapeExamples.LNotchW);
                LNotchH = Fill(LNotchH, ShapeExamples.LNotchH);
                break;
            case ShapeKind.Trapezoid:
                TrapBottom = Fill(TrapBottom, ShapeExamples.TrapBottom);
                TrapTop = Fill(TrapTop, ShapeExamples.TrapTop);
                TrapH = Fill(TrapH, ShapeExamples.TrapH);
                break;
        }
    }

    private static string Fill(string? current, string example) => string.IsNullOrWhiteSpace(current) ? example : current;
}

/// <summary>The example value for each shape field: shown as the placeholder, and filled in when a type is picked.</summary>
public static class ShapeExamples
{
    public const string RectW = "14'", RectH = "12'";
    public const string TriA = "12'", TriB = "10'", TriC = "14'";
    public const string LW = "14'", LH = "12'", LNotchW = "6'", LNotchH = "5'";
    public const string TrapBottom = "16'", TrapTop = "10'", TrapH = "10'";
}

public sealed record PaverPreset(string Name, string Length, string Width);

public static class PaverPresets
{
    public const string Custom = "Custom";

    public static IReadOnlyList<PaverPreset> All { get; } =
    [
        new("4x8 brick", "8", "4"),
        new("6x9", "9", "6"),
        new("6x6", "6", "6"),
        new("12x12", "12", "12"),
        new("16x16", "16", "16"),
        new("24x24", "24", "24"),
    ];
}
