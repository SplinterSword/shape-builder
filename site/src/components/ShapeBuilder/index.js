import React, { useEffect, useRef, useState } from "react";
import { Wrapper, CanvasContainer, OutputBox, StyledSVG } from "./shapeBuilder.styles";
import { Button, Typography, Box } from "@sistent/sistent";

const defaultStroke = "#00B39F";

function getSvgPoint(svg, clientX, clientY) {
  if (!svg) return { x: clientX, y: clientY };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}


const ShapeBuilder = () => {
  const [showCopied, setShowCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const [currentPreset, setCurrentPreset] = useState(1);

  const handleCopyToClipboard = async () => {
    if (!result.trim()) return;
    try {
      await navigator.clipboard.writeText(result);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };
  const boardRef = useRef(null);
  const [mousePoint, setMousePoint] = useState(null);
  const [nearFirst, setNearFirst] = useState(false);
  const [anchors, setAnchors] = useState([]); // {x,y, handleIn:{x,y}, handleOut:{x,y}}
  const [isClosed, setIsClosed] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [result, setResult] = useState("");

  // deep clone anchors helper
  const cloneAnchors = (arr) => arr.map(a => ({
    x: a.x, y: a.y,
    handleIn: { x: a.handleIn.x, y: a.handleIn.y },
    handleOut: { x: a.handleOut.x, y: a.handleOut.y }
  }));

  // Add a new anchor and optionally begin placing (dragging handle)
  const addAnchor = (x, y, placing = true) => {
    const newAnchor = { x, y, handleIn: { x, y }, handleOut: { x, y } };
    setAnchors(prev => {
      const next = cloneAnchors(prev);
      next.push(newAnchor);
      return next;
    });

    if (placing) {
      // index will be previous length
      setDragState(prev => ({ type: "placing", index: (anchors.length), start: { x, y } }));
    }
  };

  const updateAnchorHandle = (index, handleKey, hx, hy, symmetric = true) => {
    setAnchors(prev => {
      const next = cloneAnchors(prev);
      if (!next[index]) return prev;
      next[index][handleKey] = { x: hx, y: hy };
      if (symmetric) {
        const ax = next[index].x;
        const ay = next[index].y;
        const dx = hx - ax;
        const dy = hy - ay;
        const opposite = handleKey === "handleOut" ? "handleIn" : "handleOut";
        next[index][opposite] = { x: ax - dx, y: ay - dy };
      }
      return next;
    });
  };

  const updatePathOnMove = (clientX, clientY) => {
    if (!boardRef.current) return;
    const pt = getSvgPoint(boardRef.current, clientX, clientY);
    if (!dragState) return;

    if (dragState.type === "placing") {
      updateAnchorHandle(dragState.index, "handleOut", pt.x, pt.y, true);
    } else if (dragState.type === "handle") {
      updateAnchorHandle(dragState.index, dragState.handleKey, pt.x, pt.y, dragState.symmetric);
    }
  };

  // Mouse handlers
  const onMouseDown = (e) => {
    // left button only
    if (e.button !== 0) return;
    if (isClosed) return;

    const pt = getSvgPoint(boardRef.current, e.clientX, e.clientY);

    // If we're near the first point and already have a polygon, auto-close
    if (anchors.length >= 3) {
      const first = anchors[0];
      const dx = pt.x - first.x;
      const dy = pt.y - first.y;
      const distanceSq = dx * dx + dy * dy;
      const threshold = 6; // tighter pixels radius for snapping/closing

      if (distanceSq <= threshold * threshold) {
        setIsClosed(true);
        setDragState(null);
        return;
      }
    }

    // Otherwise, create a new anchor
    addAnchor(pt.x, pt.y, true);
  };

  const onMouseMove = (e) => {
    // update preview point
    if (!boardRef.current) return;
    const pt = getSvgPoint(boardRef.current, e.clientX, e.clientY);

    // detect proximity to first anchor for hover-close indication
    if (!isClosed && anchors.length >= 3) {
      const first = anchors[0];
      const dx = pt.x - first.x;
      const dy = pt.y - first.y;
      const distanceSq = dx * dx + dy * dy;
      const threshold = 6; // tighter radius in pixels
      setNearFirst(distanceSq <= threshold * threshold);
    } else {
      setNearFirst(false);
    }

    setMousePoint(pt);
    if (dragState) {
      updatePathOnMove(e.clientX, e.clientY);
    }
  };

  const onMouseUp = (e) => {
    // finalize placing/dragging
    setDragState(null);
  };

  const onHandleMouseDown = (e, index, handleKey) => {
    e.stopPropagation();
    const symmetric = !e.shiftKey; // shift decouples handles
    setDragState({ type: "handle", index, handleKey, symmetric });
  };

  const onAnchorMouseDown = (e, index) => {
    e.stopPropagation();

    // If we click the first point while drawing (and have enough anchors), close the shape instead of moving it
    if (!isClosed && index === 0 && anchors.length >= 3) {
      setIsClosed(true);
      setDragState(null);
      return;
    }

    // Otherwise, start moving this anchor
    const start = getSvgPoint(boardRef.current, e.clientX, e.clientY);
    setDragState({ type: "moveAnchor", index, start });
  };

  // move anchor effect
  useEffect(() => {
    if (!dragState || dragState.type !== "moveAnchor") return;

    const move = (ev) => {
      const pt = getSvgPoint(boardRef.current, ev.clientX, ev.clientY);
      setAnchors(prev => {
        const next = cloneAnchors(prev);
        const idx = dragState.index;
        if (!next[idx]) return prev;
        const dx = pt.x - dragState.start.x;
        const dy = pt.y - dragState.start.y;
        next[idx].x += dx; next[idx].y += dy;
        next[idx].handleIn.x += dx; next[idx].handleIn.y += dy;
        next[idx].handleOut.x += dx; next[idx].handleOut.y += dy;
        return next;
      });
      setDragState(s => ({ ...s, start: pt }));
    };

    const up = () => setDragState(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragState]);

  // global handle/placing drag listeners
  useEffect(() => {
    if (!dragState) return;
    if (dragState.type !== "handle" && dragState.type !== "placing") return;

    const onMove = (ev) => updatePathOnMove(ev.clientX, ev.clientY);
    const onUp = () => setDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState]);

  // keyboard handlers
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Enter" && anchors.length >= 3) {
        setIsClosed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        setAnchors(prev => prev.slice(0, -1));
        setIsClosed(false);
      }
      if (e.key === "Escape") {
        // Close shape on ESC
        if (anchors.length >= 3) {
          setIsClosed(true);
        }
        setDragState(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anchors]);

  const buildPathD = () => {
    if (anchors.length === 0) return "";
    let d = `M ${anchors[0].x} ${anchors[0].y}`;
    for (let i = 1; i < anchors.length; i++) {
      const prev = anchors[i - 1];
      const curr = anchors[i];
      d += ` C ${prev.handleOut.x} ${prev.handleOut.y}, ${curr.handleIn.x} ${curr.handleIn.y}, ${curr.x} ${curr.y}`;
    }
    if (isClosed && anchors.length >= 2) {
      const last = anchors[anchors.length - 1];
      const first = anchors[0];
      d += ` C ${last.handleOut.x} ${last.handleOut.y}, ${first.handleIn.x} ${first.handleIn.y}, ${first.x} ${first.y} Z`;
    }
    return d;
  };

  // ---- Cytoscape-compatible export ----
  // Adaptive Bezier flattening (flatness-based)
  // Produces far fewer points while preserving visual accuracy for Cytoscape

  const FLATNESS_TOLERANCE = 0.5; // px; increase to reduce points further

  const distPointToLineSq = (px, py, x1, y1, x2, y2) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D || 1;
    const param = dot / lenSq;

    const xx = x1 + param * C;
    const yy = y1 + param * D;

    const dx = px - xx;
    const dy = py - yy;
    return dx * dx + dy * dy;
  };

  const isFlatEnough = (p0, p1, p2, p3, tolSq) => {
    const d1 = distPointToLineSq(p1.x, p1.y, p0.x, p0.y, p3.x, p3.y);
    const d2 = distPointToLineSq(p2.x, p2.y, p0.x, p0.y, p3.x, p3.y);
    return d1 <= tolSq && d2 <= tolSq;
  };

  const subdivideBezier = (p0, p1, p2, p3) => {
    const p01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const p23 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };

    const p012 = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 };
    const p123 = { x: (p12.x + p23.x) / 2, y: (p12.y + p23.y) / 2 };

    const p0123 = { x: (p012.x + p123.x) / 2, y: (p012.y + p123.y) / 2 };

    return [
      [p0, p01, p012, p0123],
      [p0123, p123, p23, p3]
    ];
  };

  const flattenBezierAdaptive = (p0, p1, p2, p3, tolSq, out) => {
    if (isFlatEnough(p0, p1, p2, p3, tolSq)) {
      out.push([p3.x, p3.y]);
    } else {
      const [l, r] = subdivideBezier(p0, p1, p2, p3);
      flattenBezierAdaptive(l[0], l[1], l[2], l[3], tolSq, out);
      flattenBezierAdaptive(r[0], r[1], r[2], r[3], tolSq, out);
    }
  };

  const flattenToPoints = () => {
    if (anchors.length === 0) return [];

    const pts = [];
    const tolSq = FLATNESS_TOLERANCE * FLATNESS_TOLERANCE;

    // start point
    pts.push([anchors[0].x, anchors[0].y]);

    for (let i = 1; i < anchors.length; i++) {
      const prev = anchors[i - 1];
      const curr = anchors[i];
      flattenBezierAdaptive(
        { x: prev.x, y: prev.y },
        { x: prev.handleOut.x, y: prev.handleOut.y },
        { x: curr.handleIn.x, y: curr.handleIn.y },
        { x: curr.x, y: curr.y },
        tolSq,
        pts
      );
    }

    if (isClosed && anchors.length >= 2) {
      const last = anchors[anchors.length - 1];
      const first = anchors[0];
      flattenBezierAdaptive(
        { x: last.x, y: last.y },
        { x: last.handleOut.x, y: last.handleOut.y },
        { x: first.handleIn.x, y: first.handleIn.y },
        { x: first.x, y: first.y },
        tolSq,
        pts
      );
    }

    return pts;
  };

  const normalizePoints = (pts) => {
    if (!pts.length) return [];

    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const size = Math.max(maxX - minX, maxY - minY) || 1;

    return pts.map(([x, y]) => [
      Number(((x - cx) * 2 / size).toFixed(4)),
      Number(((y - cy) * 2 / size).toFixed(4))
    ]);
  };

  const computeExportString = () => {
    const flat = flattenToPoints();
    const normalized = normalizePoints(flat);
    return normalized.flat().join(" ");
  };

  useEffect(() => {
    setResult(computeExportString());
  }, [anchors, isClosed]);

  // Maximize: scale + translate shape to fit 520x520
  const maximize = () => {
    if (anchors.length === 0) return;

    const xs = [];
    const ys = [];
    anchors.forEach(a => {
      xs.push(a.x, a.handleIn.x, a.handleOut.x);
      ys.push(a.y, a.handleIn.y, a.handleOut.y);
    });

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;
    if (width === 0 || height === 0) return;

    const target = 520;
    const scale = Math.min(target / width, target / height);

    const offsetX = -minX;
    const offsetY = -minY;

    setAnchors(prev => prev.map(a => ({
      x: (a.x + offsetX) * scale,
      y: (a.y + offsetY) * scale,
      handleIn: {
        x: (a.handleIn.x + offsetX) * scale,
        y: (a.handleIn.y + offsetY) * scale
      },
      handleOut: {
        x: (a.handleOut.x + offsetX) * scale,
        y: (a.handleOut.y + offsetY) * scale
      }
    })));
  };

  const clear = () => {
    setAnchors([]);
    setIsClosed(false);
    setDragState(null);
    setResult("");
  };

  return (
    <Wrapper>
      <CanvasContainer>
        <StyledSVG
          ref={boardRef}
          width="100%"
          height="100%"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onDoubleClick={() => {
            if (!isClosed && anchors.length >= 3) setIsClosed(true);
          }}
        >
          <defs>
            <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#797d7a" strokeWidth="1" />
            </pattern>
          </defs>

          <rect className="grid" width="100%" height="100%" fill="url(#grid)" />
          <rect width="100%" height="100%" fill="url(#majorGrid)" opacity="0.55" />

          {/* path preview */}
          <path d={buildPathD()} fill={isClosed ? defaultStroke : "none"} fillOpacity={isClosed ? 0.3 : 1} stroke={defaultStroke} strokeWidth={2} />

          {/* preview mouse point */}
          {nearFirst && anchors.length > 0 && !isClosed && (
            // highlight halo around first point when close enough to auto-close
            <circle
              cx={anchors[0].x}
              cy={anchors[0].y}
              r={9}
              fill="none"
              stroke={defaultStroke}
              strokeWidth={2}
              strokeDasharray="2 2"
            />
          )}

          {mousePoint && anchors.length > 0 && !isClosed && (
            <line
              x1={anchors[anchors.length - 1].x}
              y1={anchors[anchors.length - 1].y}
              x2={mousePoint.x}
              y2={mousePoint.y}
              stroke="#00B39F"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
          )}

          {mousePoint && !isClosed && (
            <circle cx={mousePoint.x} cy={mousePoint.y} r={4} fill={defaultStroke} opacity={0.6} />
          )}

          {/* anchors, handles */}
          {anchors.map((a, idx) => (
            <g key={idx}>
              <line x1={a.x} y1={a.y} x2={a.handleIn.x} y2={a.handleIn.y} stroke="#bbb" strokeWidth={1} />
              <line x1={a.x} y1={a.y} x2={a.handleOut.x} y2={a.handleOut.y} stroke="#bbb" strokeWidth={1} />

              <circle
                cx={a.handleIn.x}
                cy={a.handleIn.y}
                r={6}
                fill="#fff"
                stroke="#666"
                onMouseDown={(e) => onHandleMouseDown(e, idx, "handleIn")}
              />

              <circle
                cx={a.handleOut.x}
                cy={a.handleOut.y}
                r={6}
                fill="#fff"
                stroke="#666"
                onMouseDown={(e) => onHandleMouseDown(e, idx, "handleOut")}
              />

              <circle
                cx={a.x}
                cy={a.y}
                r={5}
                fill={defaultStroke}
                stroke="#033"
                strokeWidth={1}
                onMouseDown={(e) => onAnchorMouseDown(e, idx)}
              />
            </g>
          ))}
        </StyledSVG>
      </CanvasContainer>

      <Box sx={{ display: "flex", justifyContent: "center", gap: 2, mt: 3, mb: 3, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={clear}>Clear</Button>
        <Button variant="contained" onClick={() => setIsClosed(true)}>Close Shape</Button>
        <Button variant="contained" onClick={maximize}>Maximize</Button>
      </Box>

      <OutputBox>
        <Typography variant="subtitle1" component="h6">
          SVG Path (d attribute):
        </Typography>
        <textarea readOnly value={result} />
      </OutputBox>

      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mt: 2 }}>
        <Button variant="contained" onClick={handleCopyToClipboard}>Copy</Button>
        {showCopied && (
          <span style={{ color: "#00B39F", marginTop: "8px" }}>Copied!</span>
        )}
      </Box>
    </Wrapper>
  );
};

export default ShapeBuilder;
