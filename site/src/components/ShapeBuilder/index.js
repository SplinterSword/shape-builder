// Updated ShapeBuilder with Curved Drawing Support (Figma-like)
// Style preserved from your original component

import React, { useEffect, useRef, useState } from "react";
import { Wrapper, CanvasContainer, OutputBox, StyledSVG } from "./shapeBuilder.styles";
import { Button, Typography, Box } from "@layer5/sistent";

const defaultStroke = "#00B39F";

function getSvgPoint(svg, clientX, clientY) {
  if (!svg) return { x: clientX, y: clientY };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

const ShapeBuilder = () => {
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
      setDragState(prev => ({ type: 'placing', index: (anchors.length), start: { x, y } }));
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
        const opposite = handleKey === 'handleOut' ? 'handleIn' : 'handleOut';
        next[index][opposite] = { x: ax - dx, y: ay - dy };
      }
      return next;
    });
  };

  const updatePathOnMove = (clientX, clientY) => {
    if (!boardRef.current) return;
    const pt = getSvgPoint(boardRef.current, clientX, clientY);
    if (!dragState) return;

    if (dragState.type === 'placing') {
      updateAnchorHandle(dragState.index, 'handleOut', pt.x, pt.y, true);
    } else if (dragState.type === 'handle') {
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
    setDragState({ type: 'handle', index, handleKey, symmetric });
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
    setDragState({ type: 'moveAnchor', index, start });
  };

  // move anchor effect
  useEffect(() => {
    if (!dragState || dragState.type !== 'moveAnchor') return;

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
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragState]);

  // global handle/placing drag listeners
  useEffect(() => {
    if (!dragState) return;
    if (dragState.type !== 'handle' && dragState.type !== 'placing') return;

    const onMove = (ev) => updatePathOnMove(ev.clientX, ev.clientY);
    const onUp = () => setDragState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragState]);

  // keyboard handlers
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Enter' && anchors.length >= 3) {
        setIsClosed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        setAnchors(prev => prev.slice(0, -1));
        setIsClosed(false);
      }
      if (e.key === 'Escape') {
        // Close shape on ESC
        if (anchors.length >= 3) {
          setIsClosed(true);
        }
        setDragState(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anchors]);

  const buildPathD = () => {
    if (anchors.length === 0) return '';
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

  // Export SVG path d instead of normalized points
  const computeExportString = () => {
    const d = buildPathD();
    if (!d) return '';

    const cmds = d.match(/[-+]?[0-9]*\.?[0-9]+/g)?.map(Number);
    if (!cmds || cmds.length === 0) return d;

    let index = 0;
    const normalizedD = d.replace(/[-+]?[0-9]*\.?[0-9]+/g, () => {
      const val = cmds[index++];
      return ((val - 260) / 260).toFixed(4);
    });

    return normalizedD;
  };

  useEffect(() => {
    setResult(computeExportString());
  }, [anchors, isClosed]);

  const clear = () => {
    setAnchors([]);
    setIsClosed(false);
    setDragState(null);
    setResult('');
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
        >
          <defs>
            {/* Figma-style dual-layer grid */}
            <pattern id="smallGrid" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#333" strokeWidth="0.3" />
            </pattern>

            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="url(#smallGrid)" />
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#444" strokeWidth="0.6" />
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill="#1a1a1a" />
          <rect width="100%" height="100%" fill="url(#grid)" opacity="0.4" />

          {/* path preview */}
          <path d={buildPathD()} fill={isClosed ? defaultStroke : 'none'} fillOpacity={isClosed ? 0.3 : 1} stroke={defaultStroke} strokeWidth={2} />

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
                onMouseDown={(e) => onHandleMouseDown(e, idx, 'handleIn')}
              />

              <circle
                cx={a.handleOut.x}
                cy={a.handleOut.y}
                r={6}
                fill="#fff"
                stroke="#666"
                onMouseDown={(e) => onHandleMouseDown(e, idx, 'handleOut')}
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

      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 3, mb: 3, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={clear}>Clear</Button>
        <Button variant="contained" onClick={() => setIsClosed(true)}>Close Shape</Button>
      </Box>

      <OutputBox>
        <Typography variant="subtitle1" component="h6">
          SVG Path (d attribute):
        </Typography>
        <textarea readOnly value={result} />
      </OutputBox>
    </Wrapper>
  );
};

export default ShapeBuilder;
