import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Icon, IconButton, Spinner, Tabs, Text, type IconName } from "../../base";
import "./HierarchyGraph.css";

export type HierarchyGraphDirection = "LR" | "TB";

export type HierarchyGraphItem<T = unknown> = {
  id: string;
  parentId?: string | null;
  edgeLabel?: string;
  isActive?: boolean;
  isSelected?: boolean;
  data: T;
};

export type HierarchyGraphRenderContext = {
  direction: HierarchyGraphDirection;
  isOnActivePath: boolean;
};

export type HierarchyGraphProps<T = unknown> = {
  items: HierarchyGraphItem<T>[];
  renderNode: (
    item: HierarchyGraphItem<T>,
    context: HierarchyGraphRenderContext,
  ) => ReactNode;
  onSelectItem?: (item: HierarchyGraphItem<T>) => void;
  direction?: HierarchyGraphDirection;
  defaultDirection?: HierarchyGraphDirection;
  onDirectionChange?: (direction: HierarchyGraphDirection) => void;
  showDirectionToggle?: boolean;
  toolbarExtra?: ReactNode;
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalGap?: number;
  verticalGap?: number;
  size?: "fill" | "tall" | "compact";
  height?: number | string;
  loading?: boolean;
  loadingLabel?: string;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyDescription?: string;
  ariaLabel?: string;
};

type ComputedEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  labelX: number;
  labelY: number;
  path: string;
  label?: string;
  isActive: boolean;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const CANVAS_PADDING = 48;

function clampZoom(z: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 1000) / 1000;
}

export function HierarchyGraph<T = unknown>({
  items,
  renderNode,
  onSelectItem,
  direction: controlledDirection,
  defaultDirection = "LR",
  onDirectionChange,
  showDirectionToggle = true,
  toolbarExtra,
  nodeWidth = 248,
  nodeHeight = 148,
  horizontalGap = 112,
  verticalGap = 36,
  size = "tall",
  height,
  loading = false,
  loadingLabel = "Loading graph…",
  emptyIcon = "GitBranch",
  emptyTitle = "No Items Found",
  emptyDescription = "No hierarchy nodes to display.",
  ariaLabel = "Hierarchy Tree Graph",
}: HierarchyGraphProps<T>) {
  const [internalDirection, setInternalDirection] =
    useState<HierarchyGraphDirection>(defaultDirection);
  const direction = controlledDirection ?? internalDirection;

  function handleDirectionChange(next: HierarchyGraphDirection) {
    if (controlledDirection === undefined) {
      setInternalDirection(next);
    }
    onDirectionChange?.(next);
  }

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const layout = useMemo(() => {
    if (items.length === 0) {
      return {
        positions: new Map<string, { x: number; y: number; height: number }>(),
        parentMap: new Map<string, string>(),
        childrenMap: new Map<string, string[]>(),
        activePathIds: new Set<string>(),
        edges: [] as ComputedEdge[],
        bounds: {
          minX: 0,
          minY: 0,
          maxX: nodeWidth,
          maxY: nodeHeight,
          width: nodeWidth,
          height: nodeHeight,
        },
      };
    }

    const itemIds = new Set(items.map((i) => i.id));
    const parentMap = new Map<string, string>();
    const childrenMap = new Map<string, string[]>();

    for (const item of items) {
      if (
        item.parentId &&
        itemIds.has(item.parentId) &&
        item.parentId !== item.id
      ) {
        parentMap.set(item.id, item.parentId);
        const list = childrenMap.get(item.parentId) ?? [];
        list.push(item.id);
        childrenMap.set(item.parentId, list);
      }
    }

    const roots: HierarchyGraphItem<T>[] = [];
    for (const item of items) {
      if (!parentMap.has(item.id)) {
        roots.push(item);
      }
    }
    if (roots.length === 0 && items.length > 0) {
      roots.push(items[0]);
    }

    // Active lineage path from root -> active node(s)
    const activePathIds = new Set<string>();
    for (const item of items) {
      if (item.isActive) {
        let curr: string | undefined = item.id;
        const guard = new Set<string>();
        while (curr && !guard.has(curr)) {
          guard.add(curr);
          activePathIds.add(curr);
          curr = parentMap.get(curr);
        }
      }
    }

    const positions = new Map<
      string,
      { x: number; y: number; height: number }
    >();
    const placed = new Set<string>();

    if (direction === "LR") {
      let currentY = CANVAS_PADDING;
      const stepX = nodeWidth + horizontalGap;

      // Returns vertical center (centerY) of the placed node
      const layoutSubtreeLR = (nodeId: string, depth: number): number => {
        const h = nodeHeight;
        if (placed.has(nodeId)) {
          const existing = positions.get(nodeId);
          return existing ? existing.y + existing.height / 2 : currentY + h / 2;
        }
        placed.add(nodeId);

        const children = (childrenMap.get(nodeId) ?? []).filter(
          (c) => !placed.has(c),
        );
        const x = CANVAS_PADDING + depth * stepX;

        if (children.length === 0) {
          const y = currentY;
          const centerY = y + h / 2;
          currentY += h + verticalGap;
          positions.set(nodeId, { x, y, height: h });
          return centerY;
        }

        const childCenterYs = children.map((cId) =>
          layoutSubtreeLR(cId, depth + 1),
        );
        const centerY =
          (childCenterYs[0] + childCenterYs[childCenterYs.length - 1]) / 2;
        const y = centerY - h / 2;
        positions.set(nodeId, { x, y, height: h });
        return centerY;
      };

      for (const root of roots) {
        layoutSubtreeLR(root.id, 0);
        currentY += 28;
      }
    } else {
      // Top -> Bottom ("TB")
      let currentX = CANVAS_PADDING;
      const stepX = nodeWidth + 44;
      const stepY = nodeHeight + verticalGap + 36;

      // Returns horizontal center (centerX) of the placed node
      const layoutSubtreeTB = (nodeId: string, depth: number): number => {
        const h = nodeHeight;
        if (placed.has(nodeId)) {
          const existing = positions.get(nodeId);
          return existing
            ? existing.x + nodeWidth / 2
            : currentX + nodeWidth / 2;
        }
        placed.add(nodeId);

        const children = (childrenMap.get(nodeId) ?? []).filter(
          (c) => !placed.has(c),
        );
        const y = CANVAS_PADDING + depth * stepY;

        if (children.length === 0) {
          const x = currentX;
          const centerX = x + nodeWidth / 2;
          currentX += stepX;
          positions.set(nodeId, { x, y, height: h });
          return centerX;
        }

        const childCenterXs = children.map((cId) =>
          layoutSubtreeTB(cId, depth + 1),
        );
        const centerX =
          (childCenterXs[0] + childCenterXs[childCenterXs.length - 1]) / 2;
        const x = centerX - nodeWidth / 2;
        positions.set(nodeId, { x, y, height: h });
        return centerX;
      };

      for (const root of roots) {
        layoutSubtreeTB(root.id, 0);
        currentX += 36;
      }
    }

    // Ensure all items have a position even if disconnected
    for (const item of items) {
      if (!positions.has(item.id)) {
        positions.set(item.id, {
          x: CANVAS_PADDING,
          y: CANVAS_PADDING,
          height: nodeHeight,
        });
      }
    }

    // Normalize negative coordinates if a parent centered above/left of CANVAS_PADDING
    let minX = Infinity;
    let minY = Infinity;
    for (const pos of positions.values()) {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
    }
    const shiftX = minX < CANVAS_PADDING ? CANVAS_PADDING - minX : 0;
    const shiftY = minY < CANVAS_PADDING ? CANVAS_PADDING - minY : 0;
    if (shiftX !== 0 || shiftY !== 0) {
      for (const [id, pos] of positions.entries()) {
        positions.set(id, {
          x: pos.x + shiftX,
          y: pos.y + shiftY,
          height: pos.height,
        });
      }
    }

    let finalMinX = Infinity;
    let finalMinY = Infinity;
    let finalMaxX = -Infinity;
    let finalMaxY = -Infinity;
    for (const pos of positions.values()) {
      finalMinX = Math.min(finalMinX, pos.x);
      finalMinY = Math.min(finalMinY, pos.y);
      finalMaxX = Math.max(finalMaxX, pos.x + nodeWidth);
      finalMaxY = Math.max(finalMaxY, pos.y + pos.height);
    }

    const edges: ComputedEdge[] = [];
    for (const item of items) {
      const parentId = parentMap.get(item.id);
      if (!parentId) continue;
      const parentPos = positions.get(parentId);
      const childPos = positions.get(item.id);
      if (!parentPos || !childPos) continue;

      const isActive =
        activePathIds.has(item.id) && activePathIds.has(parentId);

      if (direction === "LR") {
        // Left -> Right: ALWAYS exit parent's Right Center and enter child's Left Center
        const sx = parentPos.x + nodeWidth;
        const sy = parentPos.y + parentPos.height / 2;
        const tx = childPos.x;
        const ty = childPos.y + childPos.height / 2;
        const mx = (sx + tx) / 2;
        const path = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
        edges.push({
          id: `edge_${parentId}_${item.id}`,
          sourceId: parentId,
          targetId: item.id,
          sx,
          sy,
          tx,
          ty,
          labelX: mx,
          labelY: (sy + ty) / 2,
          path,
          label: item.edgeLabel,
          isActive,
        });
      } else {
        // Top -> Bottom: ALWAYS exit parent's Bottom Center and enter child's Top Center
        const sx = parentPos.x + nodeWidth / 2;
        const sy = parentPos.y + parentPos.height;
        const tx = childPos.x + nodeWidth / 2;
        const ty = childPos.y;
        const my = (sy + ty) / 2;
        const path = `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
        edges.push({
          id: `edge_${parentId}_${item.id}`,
          sourceId: parentId,
          targetId: item.id,
          sx,
          sy,
          tx,
          ty,
          labelX: (sx + tx) / 2,
          labelY: my,
          path,
          label: item.edgeLabel,
          isActive,
        });
      }
    }

    return {
      positions,
      parentMap,
      childrenMap,
      activePathIds,
      edges,
      bounds: {
        minX: finalMinX,
        minY: finalMinY,
        maxX: finalMaxX,
        maxY: finalMaxY,
        width: Math.max(1, finalMaxX - finalMinX),
        height: Math.max(1, finalMaxY - finalMinY),
      },
    };
  }, [
    items,
    direction,
    nodeWidth,
    nodeHeight,
    horizontalGap,
    verticalGap,
  ]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [transform, setTransform] = useState<{
    x: number;
    y: number;
    zoom: number;
  }>({ x: 24, y: 52, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);

  // Supports both 1-finger / mouse drag panning and 2-finger mobile pinch-to-zoom
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const gestureRef = useRef<{
    lastCenterX: number;
    lastCenterY: number;
    lastDist: number;
  } | null>(null);

  const fitView = useCallback(() => {
    const vp = viewportRef.current;
    const currentLayout = layoutRef.current;
    if (!vp || currentLayout.positions.size === 0) return;
    const rect = vp.getBoundingClientRect();
    const vpWidth = rect.width || 760;
    const vpHeight = rect.height || 420;
    const isCompactViewport =
      vpWidth < 640 ||
      (typeof window !== "undefined" && window.innerWidth <= 640);

    const topReserve = showDirectionToggle || toolbarExtra ? 52 : 24;
    const bottomReserve = isCompactViewport ? 48 : 28;
    const padX = isCompactViewport ? 18 : 48;

    const availW = Math.max(140, vpWidth - padX * 2);
    const availH = Math.max(120, vpHeight - topReserve - bottomReserve);

    const { bounds } = currentLayout;
    const scaleX = availW / bounds.width;
    const scaleY = availH / bounds.height;
    const zoom = clampZoom(Math.min(1, scaleX, scaleY));

    const contentCenterX = bounds.minX + bounds.width / 2;
    const contentCenterY = bounds.minY + bounds.height / 2;

    const targetCenterX = vpWidth / 2;
    const targetCenterY = topReserve + availH / 2;

    setTransform({
      x: Math.round(targetCenterX - contentCenterX * zoom),
      y: Math.round(targetCenterY - contentCenterY * zoom),
      zoom,
    });
  }, [showDirectionToggle, toolbarExtra]);

  const itemsSignature = useMemo(
    () =>
      `${direction}:${items.map((i) => `${i.id}:${i.parentId ?? ""}`).join(",")}`,
    [direction, items],
  );

  useEffect(() => {
    if (loading || items.length === 0) return;
    const raf = requestAnimationFrame(() => {
      fitView();
    });
    return () => cancelAnimationFrame(raf);
  }, [itemsSignature, loading, items.length, fitView]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || loading || items.length === 0) return;
    if (typeof ResizeObserver === "undefined") return;

    let lastW = Math.round(vp.getBoundingClientRect().width);
    let lastH = Math.round(vp.getBoundingClientRect().height);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextW = Math.round(entry.contentRect.width);
      const nextH = Math.round(entry.contentRect.height);
      if (nextW <= 0 || nextH <= 0) return;
      if (Math.abs(nextW - lastW) > 4 || Math.abs(nextH - lastH) > 4) {
        lastW = nextW;
        lastH = nextH;
        fitView();
      }
    });

    observer.observe(vp);
    return () => observer.disconnect();
  }, [loading, items.length, fitView]);

  const handleWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setTransform((prev) => {
      const nextZoom = clampZoom(prev.zoom * factor);
      if (nextZoom === prev.zoom) return prev;
      const ratio = nextZoom / prev.zoom;
      return {
        x: Math.round(cursorX - (cursorX - prev.x) * ratio),
        y: Math.round(cursorY - (cursorY - prev.y) * ratio),
        zoom: nextZoom,
      };
    });
  }, []);

  const updateGestureSnapshot = useCallback(() => {
    const pts = Array.from(activePointersRef.current.values());
    if (pts.length === 0) {
      gestureRef.current = null;
      return;
    }
    if (pts.length === 1) {
      gestureRef.current = {
        lastCenterX: pts[0].x,
        lastCenterY: pts[0].y,
        lastDist: 0,
      };
      return;
    }
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    gestureRef.current = {
      lastCenterX: cx,
      lastCenterY: cy,
      lastDist: dist,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      // Never intercept pointer events inside a node card or toolbar control
      if (
        target?.closest(
          ".common-hierarchy-node, .common-hierarchy-graph__toolbar, .common-hierarchy-graph__controls, button, a, input, select, [role='button']",
        )
      ) {
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
      setIsPanning(true);
      updateGestureSnapshot();
    },
    [updateGestureSnapshot],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });

      const prevGesture = gestureRef.current;
      const pts = Array.from(activePointersRef.current.values());
      if (!prevGesture || pts.length === 0) return;

      if (pts.length === 1) {
        const dx = pts[0].x - prevGesture.lastCenterX;
        const dy = pts[0].y - prevGesture.lastCenterY;
        gestureRef.current = {
          lastCenterX: pts[0].x,
          lastCenterY: pts[0].y,
          lastDist: 0,
        };
        setTransform((prev) => ({
          ...prev,
          x: Math.round(prev.x + dx),
          y: Math.round(prev.y + dy),
        }));
      } else if (pts.length >= 2) {
        const vp = viewportRef.current;
        const rect = vp?.getBoundingClientRect();
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

        const dx = cx - prevGesture.lastCenterX;
        const dy = cy - prevGesture.lastCenterY;
        const scaleFactor =
          prevGesture.lastDist > 12 && dist > 12
            ? dist / prevGesture.lastDist
            : 1;

        gestureRef.current = {
          lastCenterX: cx,
          lastCenterY: cy,
          lastDist: dist,
        };

        const localX = rect ? cx - rect.left : cx;
        const localY = rect ? cy - rect.top : cy;

        setTransform((prev) => {
          const nextZoom = clampZoom(prev.zoom * scaleFactor);
          const ratio = nextZoom / prev.zoom;
          return {
            x: Math.round(localX - (localX - (prev.x + dx)) * ratio),
            y: Math.round(localY - (localY - (prev.y + dy)) * ratio),
            zoom: nextZoom,
          };
        });
      }
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.delete(e.pointerId);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (activePointersRef.current.size === 0) {
        setIsPanning(false);
        gestureRef.current = null;
      } else {
        updateGestureSnapshot();
      }
    },
    [updateGestureSnapshot],
  );

  const adjustZoom = useCallback((multiplier: number) => {
    const vp = viewportRef.current;
    const rect = vp?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 380;
    const cy = rect ? rect.height / 2 : 220;
    setTransform((prev) => {
      const nextZoom = clampZoom(prev.zoom * multiplier);
      if (nextZoom === prev.zoom) return prev;
      const ratio = nextZoom / prev.zoom;
      return {
        x: Math.round(cx - (cx - prev.x) * ratio),
        y: Math.round(cy - (cy - prev.y) * ratio),
        zoom: nextZoom,
      };
    });
  }, []);

  const containerStyle: CSSProperties | undefined =
    height !== undefined
      ? {
          height: typeof height === "number" ? `${height}px` : height,
        }
      : undefined;

  const svgWidth = layout.bounds.maxX + CANVAS_PADDING * 2;
  const svgHeight = layout.bounds.maxY + CANVAS_PADDING * 2;

  return (
    <div
      className={`common-hierarchy-graph common-hierarchy-graph--${size}`}
      style={containerStyle}
      aria-label={ariaLabel}
    >
      {(showDirectionToggle || toolbarExtra) && !loading && items.length > 0 ? (
        <div className="common-hierarchy-graph__toolbar">
          {showDirectionToggle ? (
            <Tabs<HierarchyGraphDirection>
              variant="segmented"
              size="sm"
              activeTab={direction}
              onChange={handleDirectionChange}
              ariaLabel="Tree layout orientation"
              tabs={[
                {
                  id: "LR",
                  label: "Left → Right",
                  icon: "ArrowRight",
                },
                {
                  id: "TB",
                  label: "Top → Bottom",
                  icon: "ArrowDown",
                },
              ]}
            />
          ) : null}
          {toolbarExtra}
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="common-hierarchy-graph__controls">
          <IconButton
            icon="ZoomIn"
            size="sm"
            variant="ghost"
            label="Zoom in"
            title="Zoom in"
            onClick={() => adjustZoom(1.2)}
          />
          <Text
            size="2xs"
            tone="secondary"
            className="common-hierarchy-graph__zoom-readout"
          >
            {Math.round(transform.zoom * 100)}%
          </Text>
          <IconButton
            icon="ZoomOut"
            size="sm"
            variant="ghost"
            label="Zoom out"
            title="Zoom out"
            onClick={() => adjustZoom(0.84)}
          />
          <IconButton
            icon="Maximize2"
            size="sm"
            variant="ghost"
            label="Fit tree to view"
            title="Fit tree to view"
            onClick={fitView}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="common-hierarchy-graph__overlay">
          <Spinner size={26} />
          <Text size="sm" tone="secondary">
            {loadingLabel}
          </Text>
        </div>
      ) : items.length === 0 ? (
        <div className="common-hierarchy-graph__overlay">
          <Icon name={emptyIcon} size={36} className="ds-icon-muted" />
          <Text size="md" weight="semibold">
            {emptyTitle}
          </Text>
          <Text size="xs" tone="secondary">
            {emptyDescription}
          </Text>
        </div>
      ) : (
        <div
          ref={viewportRef}
          className={`common-hierarchy-graph__viewport${isPanning ? " common-hierarchy-graph__viewport--panning" : ""}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            className="common-hierarchy-graph__pan-layer"
            style={{
              transform: `translate(${Math.round(transform.x)}px, ${Math.round(transform.y)}px) scale(${transform.zoom})`,
            }}
          >
            <div className="common-hierarchy-graph__stage">
              {/* SVG Connector Layer */}
              <svg
                className="common-hierarchy-graph__edges"
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                aria-hidden="true"
              >
                {layout.edges.map((edge) => (
                  <g key={edge.id} className="common-hierarchy-edge-group">
                    <path
                      d={edge.path}
                      className={`common-hierarchy-edge${edge.isActive ? " common-hierarchy-edge--active" : ""}`}
                    />
                    <circle
                      cx={edge.sx}
                      cy={edge.sy}
                      r={4}
                      className={`common-hierarchy-edge-dot${edge.isActive ? " common-hierarchy-edge-dot--active" : ""}`}
                    />
                    <circle
                      cx={edge.tx}
                      cy={edge.ty}
                      r={4}
                      className={`common-hierarchy-edge-dot${edge.isActive ? " common-hierarchy-edge-dot--active" : ""}`}
                    />
                  </g>
                ))}
              </svg>

              {/* Edge Pill Labels Layer */}
              {layout.edges.map((edge) =>
                edge.label ? (
                  <div
                    key={`${edge.id}_label`}
                    className={`common-hierarchy-edge-label${edge.isActive ? " common-hierarchy-edge-label--active" : ""}`}
                    style={{
                      left: `${edge.labelX}px`,
                      top: `${edge.labelY}px`,
                    }}
                  >
                    {edge.label}
                  </div>
                ) : null,
              )}

              {/* Interactive Static Node Cards Layer */}
              {items.map((item) => {
                const pos = layout.positions.get(item.id) ?? {
                  x: CANVAS_PADDING,
                  y: CANVAS_PADDING,
                  height: nodeHeight,
                };
                const isOnActivePath = layout.activePathIds.has(item.id);

                const classes = [
                  "common-hierarchy-node",
                  item.isActive ? "common-hierarchy-node--active" : "",
                  item.isSelected ? "common-hierarchy-node--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={item.id}
                    data-hierarchy-node-id={item.id}
                    className={classes}
                    style={{
                      width: `${nodeWidth}px`,
                      height: `${nodeHeight}px`,
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                    }}
                    onClick={() => onSelectItem?.(item)}
                  >
                    {renderNode(item, { direction, isOnActivePath })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HierarchyGraph;
