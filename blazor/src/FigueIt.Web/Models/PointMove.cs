using FigueIt.Engine;

namespace FigueIt.Web.Models;

/// <summary>A custom-polygon point being dragged. <paramref name="Final"/> is true when the pointer is released.</summary>
public readonly record struct PointMove(int Index, Pt Point, bool Final);
