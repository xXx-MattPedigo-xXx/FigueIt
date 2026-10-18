// Tiny helpers for the Plotter component. Blazor passes the <svg> element in as an ElementReference.

// Converts a pointer position (client pixels) to SVG user units, honouring viewBox, scaling and letterboxing.
export function toSvg(svg, clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
}

// While a point is being dragged, keep receiving its pointer events even when the finger or mouse leaves the SVG.
export function capture(svg, pointerId) {
    try { svg.setPointerCapture(pointerId); } catch { /* pointer already gone */ }
}

export function release(svg, pointerId) {
    try { svg.releasePointerCapture(pointerId); } catch { /* not captured */ }
}
