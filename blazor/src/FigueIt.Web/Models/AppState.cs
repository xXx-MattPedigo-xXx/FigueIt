using FigueIt.Engine;

namespace FigueIt.Web.Models;

public enum ShapeKind { Rectangle, Triangle, LShape, Trapezoid, Polygon }

/// <summary>
/// Everything the user can edit. This is the object saved to localStorage, so it holds only plain values.
/// Length fields stay as the text the user typed; the engine parses them.
/// </summary>
public sealed class AppState
{
    public ShapeKind Kind { get; set; } = ShapeKind.Rectangle;

    // shape fields (feet by default)
    public string RectW { get; set; } = "14";
    public string RectH { get; set; } = "12";
    public string TriA { get; set; } = "12";
    public string TriB { get; set; } = "10";
    public string TriC { get; set; } = "14";
    public string LW { get; set; } = "14";
    public string LH { get; set; } = "12";
    public string LNotchW { get; set; } = "6";
    public string LNotchH { get; set; } = "5";
    public string TrapBottom { get; set; } = "16";
    public string TrapTop { get; set; } = "10";
    public string TrapH { get; set; } = "10";

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
