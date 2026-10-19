using FigueIt.Engine;
using FigueIt.Web.Models;
using FigueIt.Web.Services;

namespace FigueIt.Web.Tests;

public class DrawnPatternTests
{
    private static readonly Paver Brick = new(8, 4, 0.125);
    private static readonly Paver SixByNine = new(9, 6, 0.125);
    private static readonly Paver Square = new(12, 12, 0.125);
    private static readonly Paver TenByFour = new(10, 4, 0.125);

    [Fact]
    public void Draws_the_chosen_pattern_when_the_paver_suits_it()
    {
        Assert.Equal(PatternId.Herringbone, Calculator.DrawnPattern(PatternId.Herringbone, Brick));
        Assert.Equal(PatternId.Basketweave, Calculator.DrawnPattern(PatternId.Basketweave, Brick));
        Assert.Equal(PatternId.Stack, Calculator.DrawnPattern(PatternId.Stack, Brick));
    }

    [Theory]
    [InlineData(PatternId.Herringbone)]
    [InlineData(PatternId.Basketweave)]
    public void Falls_back_to_running_bond_for_a_paver_that_does_not_suit_the_pattern(PatternId chosen)
    {
        foreach (var paver in new[] { SixByNine, Square, TenByFour })
            Assert.Equal(PatternId.Running, Calculator.DrawnPattern(chosen, paver));
    }

    [Fact]
    public void Never_changes_stack_or_running_and_keeps_the_choice_without_a_valid_paver()
    {
        foreach (var paver in new[] { Brick, SixByNine, Square, TenByFour })
        {
            Assert.Equal(PatternId.Stack, Calculator.DrawnPattern(PatternId.Stack, paver));
            Assert.Equal(PatternId.Running, Calculator.DrawnPattern(PatternId.Running, paver));
        }
        Assert.Equal(PatternId.Herringbone, Calculator.DrawnPattern(PatternId.Herringbone, null));
    }

    [Fact]
    public void Switches_back_by_itself_when_the_paver_fits_again()
    {
        Assert.Equal(PatternId.Running, Calculator.DrawnPattern(PatternId.Herringbone, SixByNine));
        Assert.Equal(PatternId.Herringbone, Calculator.DrawnPattern(PatternId.Herringbone, Brick));
    }

    [Fact]
    public void Note_is_null_when_nothing_changed_and_names_the_pattern_and_reason_otherwise()
    {
        Assert.Null(Calculator.FallbackNote(PatternId.Herringbone, PatternId.Herringbone));
        Assert.Equal(
            "Herringbone needs a 2:1 paver like 4x8, so this layout uses Running bond. It switches back when the paver fits.",
            Calculator.FallbackNote(PatternId.Herringbone, PatternId.Running));
        Assert.Contains("Basketweave needs a 2:1 paver", Calculator.FallbackNote(PatternId.Basketweave, PatternId.Running));
    }
}

public class SwitchKindTests
{
    [Fact]
    public void A_blank_state_is_the_blank_grid()
    {
        var s = new AppState();
        Assert.Equal(ShapeKind.Polygon, s.Kind);
        Assert.Empty(s.Points);
        Assert.False(Calculator.Evaluate(s).Valid);
    }

    [Fact]
    public void Picking_a_type_with_all_fields_empty_fills_the_examples_and_gives_a_shape()
    {
        foreach (var kind in new[] { ShapeKind.Rectangle, ShapeKind.Triangle, ShapeKind.LShape, ShapeKind.Trapezoid })
        {
            var s = new AppState();
            s.SwitchKind(kind);
            Assert.Equal(kind, s.Kind);
            var ev = Calculator.Evaluate(s);
            Assert.True(ev.Valid, $"{kind}: {ev.Message}");
            Assert.False(ev.ShapeHasError);
        }
        var rect = new AppState();
        rect.SwitchKind(ShapeKind.Rectangle);
        Assert.Equal(("14'", "12'"), (rect.RectW, rect.RectH));
    }

    [Fact]
    public void Round_trip_keeps_what_the_user_typed_and_other_types_are_untouched()
    {
        var s = new AppState { RectW = "20", RectH = "15" };
        s.SwitchKind(ShapeKind.Rectangle);
        s.SwitchKind(ShapeKind.Triangle);
        Assert.Equal("12'", s.TriA);
        Assert.Equal(("20", "15"), (s.RectW, s.RectH));
        s.SwitchKind(ShapeKind.Rectangle);
        Assert.Equal(("20", "15"), (s.RectW, s.RectH));
        Assert.Equal("", s.LW);
    }

    [Fact]
    public void Only_the_empty_fields_are_filled_and_filled_ones_are_kept()
    {
        var s = new AppState();
        s.SwitchKind(ShapeKind.Rectangle);
        Assert.Equal(("14'", "12'"), (s.RectW, s.RectH));

        var l = new AppState { LW = "14", LH = "12" }; // as if carried over from a 14 x 12 rectangle
        l.SwitchKind(ShapeKind.LShape);
        Assert.Equal(("14", "12", "6'", "5'"), (l.LW, l.LH, l.LNotchW, l.LNotchH));
        Assert.True(Calculator.Evaluate(l).Valid);

        var trap = new AppState { TrapH = "12" };
        trap.SwitchKind(ShapeKind.Trapezoid);
        Assert.Equal(("16'", "10'", "12"), (trap.TrapBottom, trap.TrapTop, trap.TrapH));

        var tri = new AppState { TriA = "9", TriB = "  " };
        tri.SwitchKind(ShapeKind.Triangle);
        Assert.Equal(("9", "10'", "14'"), (tri.TriA, tri.TriB, tri.TriC));
    }

    [Fact]
    public void Kept_values_that_clash_with_the_examples_give_the_normal_field_error()
    {
        var s = new AppState { LW = "5", LH = "12" }; // 5' wide gets a 6' notch
        s.SwitchKind(ShapeKind.LShape);
        var ev = Calculator.Evaluate(s);
        Assert.False(ev.Valid);
        Assert.True(ev.ShapeHasError);
        Assert.Equal("must be narrower than the width", ev.ErrorFor("l.nw"));
    }

    [Fact]
    public void Walking_through_every_type_gives_a_shape_at_each_step()
    {
        var s = new AppState();
        foreach (var kind in new[] { ShapeKind.Rectangle, ShapeKind.LShape, ShapeKind.Trapezoid, ShapeKind.Triangle, ShapeKind.Rectangle })
        {
            s.SwitchKind(kind);
            Assert.True(Calculator.Evaluate(s).Valid, kind.ToString());
        }
    }

    [Fact]
    public void Switching_to_polygon_keeps_the_points()
    {
        var s = new AppState { Points = [new Pt(0, 0), new Pt(10, 0), new Pt(10, 10)], Closed = true };
        s.SwitchKind(ShapeKind.Rectangle);
        s.SwitchKind(ShapeKind.Polygon);
        Assert.Equal(3, s.Points.Count);
        Assert.True(s.Closed);
    }
}
