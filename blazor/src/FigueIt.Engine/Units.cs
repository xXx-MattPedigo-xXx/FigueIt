using System.Globalization;
using System.Text.RegularExpressions;

namespace FigueIt.Engine;

/// <summary>Unit applied to a lone unitless length.</summary>
public enum Unit
{
    Ft,
    In,
}

public static partial class Units
{
    private const string Number = @"[0-9]+/[0-9]+|[0-9]+(?:\.[0-9]+)?(?:\s+[0-9]+/[0-9]+)?";

    [GeneratedRegex(@"\G(" + Number + @")\s*(feet|foot|ft|inches|inch|in|cm|mm|m|'|"")?", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex TokenRegex();

    [GeneratedRegex(@"^([0-9]+(?:\.[0-9]+)?)-(" + Number + @")$", RegexOptions.CultureInvariant)]
    private static partial Regex DashRegex();

    private static readonly string[] Fractions = ["", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"];

    private static double InchesPer(string unit) => unit switch
    {
        "ft" or "feet" or "foot" or "'" => 12,
        "in" or "inch" or "inches" or "\"" => 1,
        "m" => 39.37007874015748,
        "cm" => 0.3937007874015748,
        "mm" => 0.03937007874015748,
        _ => throw new ArgumentOutOfRangeException(nameof(unit), unit, null),
    };

    private static bool IsFeet(string unit) => InchesPer(unit) == 12;

    private static double ParseNumber(string text)
    {
        double total = 0;
        foreach (var part in text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
        {
            var slash = part.IndexOf('/');
            if (slash >= 0)
            {
                total += double.Parse(part.AsSpan(0, slash), CultureInfo.InvariantCulture)
                       / double.Parse(part.AsSpan(slash + 1), CultureInfo.InvariantCulture);
            }
            else
            {
                total += double.Parse(part, CultureInfo.InvariantCulture);
            }
        }
        return total;
    }

    /// <summary>
    /// Parses things like 12'6", 12 ft 6 in, 12-6, 3/8", 2.5m. Returns inches, or null if invalid.
    /// </summary>
    public static double? ParseLength(string? text, Unit defaultUnit)
    {
        var s = text?.Trim();
        if (string.IsNullOrEmpty(s)) return null;

        var dash = DashRegex().Match(s);
        if (dash.Success)
            return double.Parse(dash.Groups[1].Value, CultureInfo.InvariantCulture) * 12 + ParseNumber(dash.Groups[2].Value);

        var tokens = new List<(double Value, string? Unit)>();
        var token = TokenRegex();
        var pos = 0;
        while (pos < s.Length)
        {
            while (pos < s.Length && char.IsWhiteSpace(s[pos])) pos++;
            if (pos >= s.Length) break;
            var m = token.Match(s, pos);
            if (!m.Success) return null;
            tokens.Add((ParseNumber(m.Groups[1].Value), m.Groups[2].Success ? m.Groups[2].Value.ToLowerInvariant() : null));
            pos = m.Index + m.Length;
        }
        if (tokens.Count == 0) return null;

        if (tokens.Count == 1)
        {
            var unit = tokens[0].Unit ?? (defaultUnit == Unit.Ft ? "ft" : "in");
            return tokens[0].Value * InchesPer(unit);
        }

        double total = 0;
        string? prevUnit = null;
        foreach (var (value, tokenUnit) in tokens)
        {
            var unit = tokenUnit;
            if (unit is null)
            {
                if (prevUnit is null || !IsFeet(prevUnit)) return null;
                unit = "in";
            }
            total += value * InchesPer(unit);
            prevUnit = unit;
        }
        return total;
    }

    /// <summary>Formats inches as feet and inches to the nearest eighth: 150.5 -> 12' 6 1/2"</summary>
    public static string FormatLength(double inches)
    {
        var eighths = (long)Math.Floor(inches * 8 + 0.5); // JS-style rounding
        var ft = (long)Math.Floor(eighths / 96.0);
        var rem = eighths - ft * 96;
        var whole = rem / 8;
        var frac = Fractions[rem % 8];
        var inchPart = whole == 0 && frac.Length > 0 ? frac
            : frac.Length > 0 ? $"{whole} {frac}"
            : whole.ToString(CultureInfo.InvariantCulture);
        if (ft == 0) return $"{inchPart}\"";
        if (whole == 0 && frac.Length == 0) return $"{ft}'";
        return $"{ft}' {inchPart}\"";
    }

    /// <summary>Square inches as square feet with two decimals and thousands separators: 1,234.50</summary>
    public static string FormatSqFt(double squareInches) =>
        (squareInches / 144).ToString("N2", CultureInfo.InvariantCulture);
}
