import { useEffect, useRef, useState } from "react";
import type { LocationEntry } from "../../../schemas";

export type MiniMapProps = {
  locations: LocationEntry[];
  currentLocationId: string;
};

const VIEW_W = 300;
const VIEW_H = 180;

function MapCanvas({
  locations,
  currentLocationId,
  isModal = false,
  onExpand,
  onCloseModal,
}: {
  locations: LocationEntry[];
  currentLocationId: string;
  isModal?: boolean;
  onExpand?: () => void;
  onCloseModal?: () => void;
}) {
  const [viewBox, setViewBox] = useState({ x: -VIEW_W / 2, y: -VIEW_H / 2, w: VIEW_W, h: VIEW_H });
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; vbx: number; vby: number } | null>(null);

  // Auto-center on current location when it changes
  useEffect(() => {
    const current = locations.find((l) => l.id === currentLocationId);
    if (current) {
      setViewBox((vb) => ({ ...vb, x: current.x - vb.w / 2, y: current.y - vb.h / 2 }));
    }
  }, [currentLocationId, locations]);

  function recenter() {
    const current = locations.find((l) => l.id === currentLocationId);
    if (current) {
      setViewBox((vb) => ({ ...vb, x: current.x - vb.w / 2, y: current.y - vb.h / 2 }));
    }
  }

  function fitAll() {
    if (locations.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const l of locations) {
      if (l.x < minX) minX = l.x;
      if (l.y < minY) minY = l.y;
      if (l.x > maxX) maxX = l.x;
      if (l.y > maxY) maxY = l.y;
    }
    const pad = 60;
    const w = Math.max(VIEW_W, (maxX - minX) + pad * 2);
    const h = Math.max(VIEW_H, (maxY - minY) + pad * 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewBox({ x: cx - w / 2, y: cy - h / 2, w, h });
  }

  function zoomIn() {
    setViewBox((vb) => {
      const nextW = Math.max(100, vb.w * 0.8);
      const nextH = Math.max(60, vb.h * 0.8);
      return { x: vb.x + (vb.w - nextW) / 2, y: vb.y + (vb.h - nextH) / 2, w: nextW, h: nextH };
    });
  }

  function zoomOut() {
    setViewBox((vb) => {
      const nextW = Math.min(1200, vb.w * 1.25);
      const nextH = Math.min(720, vb.h * 1.25);
      return { x: vb.x + (vb.w - nextW) / 2, y: vb.y + (vb.h - nextH) / 2, w: nextW, h: nextH };
    });
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const factor = e.deltaY < 0 ? 0.88 : 1.14;

    const mouseX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w;
    const mouseY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h;

    setViewBox((vb) => {
      const nextW = Math.min(1200, Math.max(80, vb.w * factor));
      const nextH = Math.min(720, Math.max(50, vb.h * factor));
      const nextX = mouseX - ((mouseX - vb.x) / vb.w) * nextW;
      const nextY = mouseY - ((mouseY - vb.y) / vb.h) * nextH;

      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextW) || !Number.isFinite(nextH)) {
        return vb;
      }
      return { x: nextX, y: nextY, w: nextW, h: nextH };
    });
  }

  // Pointer Pan handlers
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return; // Primary click only
    // If clicking on a node, do not capture pointer on SVG so node onClick fires properly
    if ((e.target as Element).closest(".map-node")) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, vbx: viewBox.x, vby: viewBox.y };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;

    const dx = (e.clientX - dragRef.current.startX) * (viewBox.w / width);
    const dy = (e.clientY - dragRef.current.startY) * (viewBox.h / height);
    const nextX = dragRef.current.vbx - dx;
    const nextY = dragRef.current.vby - dy;

    if (Number.isFinite(nextX) && Number.isFinite(nextY)) {
      setViewBox((vb) => ({ ...vb, x: nextX, y: nextY }));
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if capture was lost
      }
      dragRef.current = null;
    }
  }

  const activeId = selected || hovered;
  const activeLoc = activeId ? locations.find((l) => l.id === activeId) : null;
  const activeConnectionSet = new Set<string>();
  if (activeLoc) {
    activeConnectionSet.add(activeLoc.id);
    for (const c of activeLoc.connections ?? []) activeConnectionSet.add(c);
  }

  const selectedLoc = selected ? locations.find((l) => l.id === selected) : null;

  return (
    <>
      {!isModal ? (
        <div className="minimap-header">
          <h3>Map</h3>
          <div className="minimap-toolbar">
            <button type="button" onClick={zoomIn} title="Zoom In">+</button>
            <button type="button" onClick={zoomOut} title="Zoom Out">−</button>
            <button type="button" onClick={recenter} title="Recenter on Player">🎯</button>
            <button type="button" onClick={fitAll} title="Fit All Locations">⌖</button>
            {onExpand && (
              <button type="button" onClick={onExpand} title="Expand World Map">⛶</button>
            )}
          </div>
        </div>
      ) : (
        <header className="modal-header minimap-modal-header">
          <div className="minimap-modal-title-group">
            <h2>World Map</h2>
            <div className="minimap-toolbar">
              <button type="button" onClick={zoomIn} title="Zoom In">+</button>
              <button type="button" onClick={zoomOut} title="Zoom Out">−</button>
              <button type="button" onClick={recenter} title="Recenter on Player">🎯</button>
              <button type="button" onClick={fitAll} title="Fit All Locations">⌖</button>
            </div>
          </div>
          {onCloseModal && (
            <button type="button" className="quest-icon-btn" onClick={onCloseModal} title="Close map">✕</button>
          )}
        </header>
      )}

      <div className={`minimap-viewport-wrapper${isModal ? " is-modal" : ""}`}>
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onClick={() => setSelected(null)}
          className={`minimap-svg${isModal ? " modal-svg" : ""}`}
        >
          <defs>
            <pattern id={`minimap-grid-${isModal ? "modal" : "main"}`} width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
              <circle cx="0" cy="0" r="1.5" fill="rgba(255, 255, 255, 0.12)" />
            </pattern>
          </defs>

          <rect
            x={viewBox.x - viewBox.w * 2}
            y={viewBox.y - viewBox.h * 2}
            width={viewBox.w * 5}
            height={viewBox.h * 5}
            fill={`url(#minimap-grid-${isModal ? "modal" : "main"})`}
            pointerEvents="none"
          />

          {/* Edges */}
          {locations.flatMap((loc) =>
            (loc.connections ?? []).map((connId) => {
              const target = locations.find((l) => l.id === connId);
              if (!target) return null;
              if (loc.id > connId) return null;
              const isHighlighted = activeLoc && activeConnectionSet.has(loc.id) && activeConnectionSet.has(connId);
              return (
                <line
                  key={`${loc.id}-${connId}`}
                  x1={loc.x}
                  y1={loc.y}
                  x2={target.x}
                  y2={target.y}
                  className={`map-edge${isHighlighted ? " map-edge-highlighted" : ""}`}
                />
              );
            })
          )}

          {/* Nodes */}
          {locations.map((loc) => {
            const isCurrent = loc.id === currentLocationId;
            const isSelected = loc.id === selected;
            const isHovered = loc.id === hovered;
            const isConnected = activeLoc && activeConnectionSet.has(loc.id);

            let nodeClass = "map-node-default";
            if (isCurrent) nodeClass = "map-node-current";

            return (
              <g
                key={loc.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(loc.id);
                }}
                onMouseEnter={() => setHovered(loc.id)}
                onMouseLeave={() => setHovered(null)}
                className={`map-node${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}${isConnected ? " is-connected" : ""}`}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={loc.x}
                  cy={loc.y}
                  r={16}
                  className={nodeClass}
                />
                {(isSelected || isHovered) && (
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={20}
                    className="map-node-ring"
                    fill="none"
                  />
                )}
                <text
                  x={loc.x}
                  y={loc.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="map-node-icon"
                  pointerEvents="none"
                >
                  {loc.icon}
                </text>
                <title>{loc.name}</title>
              </g>
            );
          })}
        </svg>

        {/* Location detail popover */}
        {selectedLoc ? (
          <div className="map-popover">
            <strong>{selectedLoc.icon} {selectedLoc.name}</strong>
            {selectedLoc.description ? <p>{selectedLoc.description}</p> : null}
            {selectedLoc.state ? <p className="map-loc-state">{selectedLoc.state}</p> : null}
            {(selectedLoc.connections ?? []).length > 0 ? (
              <p className="map-connections">
                Connected to: {(selectedLoc.connections ?? []).map((id) => locations.find((l) => l.id === id)?.name ?? id).join(", ")}
              </p>
            ) : (
              <p className="map-connections">No connections.</p>
            )}
            {selectedLoc.id === currentLocationId ? (
              <p className="map-current-here">● You are here</p>
            ) : null}
            <button type="button" onClick={() => setSelected(null)}>Close</button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function MiniMap({ locations, currentLocationId }: MiniMapProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (locations.length === 0) return null;

  return (
    <div className="minimap-container">
      <MapCanvas
        locations={locations}
        currentLocationId={currentLocationId}
        onExpand={() => setIsExpanded(true)}
      />

      {isExpanded ? (
        <div className="modal-backdrop" onClick={() => setIsExpanded(false)}>
          <section className="modal minimap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="minimap-modal-body">
              <MapCanvas
                locations={locations}
                currentLocationId={currentLocationId}
                isModal={true}
                onCloseModal={() => setIsExpanded(false)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
