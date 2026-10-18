using FigueIt.Engine;

namespace FigueIt.Engine.Tests;

public class IsSimpleTests
{
    private static Pt[] P(params double[] xy) =>
        [.. Enumerable.Range(0, xy.Length / 2).Select(i => new Pt(xy[2 * i], xy[2 * i + 1]))];

    [Fact]
    public void Rectangle_is_simple() => Assert.True(Shapes.IsSimple(P(0, 0, 10, 0, 10, 5, 0, 5)));

    [Fact]
    public void L_shape_is_simple() => Assert.True(Shapes.IsSimple(P(0, 0, 10, 0, 10, 5, 5, 5, 5, 10, 0, 10)));

    [Fact]
    public void Clockwise_triangle_is_simple() => Assert.True(Shapes.IsSimple(P(0, 0, 0, 10, 10, 0)));

    [Fact]
    public void Bowtie_is_not_simple() => Assert.False(Shapes.IsSimple(P(0, 0, 10, 10, 10, 0, 0, 10)));

    [Fact]
    public void Fewer_than_three_points_is_not_simple() => Assert.False(Shapes.IsSimple(P(0, 0, 10, 0)));

    [Fact]
    public void Repeated_point_is_not_simple() => Assert.False(Shapes.IsSimple(P(0, 0, 10, 0, 10, 0, 10, 10, 0, 10)));

    [Fact]
    public void Vertex_touching_another_edge_is_not_simple() =>
        Assert.False(Shapes.IsSimple(P(0, 0, 10, 0, 10, 10, 5, 0, 0, 10)));

    [Fact]
    public void Edge_folding_back_on_itself_is_not_simple() =>
        Assert.False(Shapes.IsSimple(P(0, 0, 10, 0, 5, 0, 5, 5)));

    [Fact]
    public void Collinear_vertex_on_straight_edge_is_simple() =>
        Assert.True(Shapes.IsSimple(P(0, 0, 5, 0, 10, 0, 10, 10, 0, 10)));
}
