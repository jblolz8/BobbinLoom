import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Playthrough } from "../../../schemas";
import { listPlaythroughTimelines, deletePlaythrough, renamePlaythrough, promotePlaythroughBranch } from "../../api";
import { Icon } from "../base";

export type TimelineModalProps = {
  open: boolean;
  onClose: () => void;
  activePlaythrough: Playthrough;
  onSwitchPlaythrough: (id: string) => Promise<void> | void;
};

type TimelineNodeData = {
  playthrough: Playthrough;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (p: Playthrough) => void;
  onSwitch: (id: string) => void;
};

function TimelineCustomNode({ data }: { data: TimelineNodeData }) {
  const { playthrough, isActive, isSelected, onSelect, onSwitch } = data;
  const lastMsg = playthrough.messages[playthrough.messages.length - 1];

  return (
    <div
      className={`timeline-custom-node ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""}`}
      onClick={() => onSelect(playthrough)}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="timeline-handle"
      />

      <div className="timeline-node-header">
        <span className="timeline-turn-badge">
          Turn {playthrough.turn}
        </span>
        {isActive ? (
          <span className="timeline-active-badge">
            ACTIVE
          </span>
        ) : null}
      </div>

      <div className="timeline-node-title" title={playthrough.name}>
        {playthrough.name}
      </div>

      <div className="timeline-node-meta">
        {playthrough.createdFromTurn !== undefined && playthrough.createdFromTurn > 0 ? (
          <span className="timeline-meta-branched">
            <Icon name="GitBranch" size={10} /> T{playthrough.createdFromTurn}
          </span>
        ) : (
          <span className="timeline-meta-origin">Root</span>
        )}
        <span className="timeline-meta-msgs">
          {playthrough.messages.length} msgs
        </span>
      </div>

      {lastMsg ? (
        <div className="timeline-node-preview" title={lastMsg.content}>
          <span className="preview-role">{lastMsg.role === "user" ? "You" : "AI"}:</span>{" "}
          {lastMsg.content.slice(0, 50)}{lastMsg.content.length > 50 ? "…" : ""}
        </div>
      ) : null}

      <div className="timeline-node-actions">
        {isActive ? (
          <span className="timeline-current-label">Current Timeline</span>
        ) : (
          <button
            className="timeline-switch-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSwitch(playthrough.id);
            }}
          >
            Switch
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="timeline-handle"
      />
    </div>
  );
}

const nodeTypes = {
  timelineNode: TimelineCustomNode,
};

export function TimelineModal({
  open,
  onClose,
  activePlaythrough,
  onSwitchPlaythrough,
}: TimelineModalProps) {
  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlaythrough, setSelectedPlaythrough] = useState<Playthrough | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Load timelines for active playthrough when modal opens
  const fetchPlaythroughs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPlaythroughTimelines(activePlaythrough.id);
      setPlaythroughs(res.timelines);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activePlaythrough.id]);

  useEffect(() => {
    if (open) {
      void fetchPlaythroughs();
      setSelectedPlaythrough(activePlaythrough);
      setDeleteConfirmId(null);
      setRenaming(false);
    }
  }, [open, fetchPlaythroughs, activePlaythrough]);

  // Keep selectedPlaythrough in sync with loaded playthroughs
  useEffect(() => {
    if (selectedPlaythrough) {
      const updated = playthroughs.find((p) => p.id === selectedPlaythrough.id);
      if (updated) setSelectedPlaythrough(updated);
    }
  }, [playthroughs, selectedPlaythrough]);

  const handleSelect = useCallback((p: Playthrough) => {
    setSelectedPlaythrough(p);
    setRenaming(false);
    setDeleteConfirmId(null);
  }, []);

  const handleSwitch = useCallback(
    async (id: string) => {
      await onSwitchPlaythrough(id);
      onClose();
    },
    [onSwitchPlaythrough, onClose]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deletePlaythrough(id);
        setDeleteConfirmId(null);
        if (selectedPlaythrough?.id === id) {
          setSelectedPlaythrough(activePlaythrough);
        }
        await fetchPlaythroughs();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [selectedPlaythrough, activePlaythrough, fetchPlaythroughs]
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!renameDraft.trim()) return;
      try {
        const updated = await renamePlaythrough(id, renameDraft.trim());
        setPlaythroughs((prev) => prev.map((p) => (p.id === id ? updated : p)));
        setSelectedPlaythrough(updated);
        setRenaming(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [renameDraft]
  );

  const handlePromote = useCallback(
    async (id: string) => {
      try {
        const updated = await promotePlaythroughBranch(id);
        setPlaythroughs((prev) => prev.map((p) => (p.id === id ? updated : p)));
        setSelectedPlaythrough(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    []
  );

  // Compute graph nodes and edges
  useEffect(() => {
    if (!open || playthroughs.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Branch ID mapping
    const branchMap = new Map<string, Playthrough>();
    for (const p of playthroughs) {
      const bId = p.branchId || p.id;
      branchMap.set(bId, p);
    }

    const relevantList = playthroughs;

    // Build parent-child tree mapping within the relevant set
    const relevantIds = new Set(relevantList.map((p) => p.id));
    const childrenMap = new Map<string, string[]>();
    const parentMap = new Map<string, string>();

    for (const p of relevantList) {
      if (p.parentBranchId) {
        const parent = branchMap.get(p.parentBranchId);
        if (parent && relevantIds.has(parent.id) && parent.id !== p.id) {
          parentMap.set(p.id, parent.id);
          const list = childrenMap.get(parent.id) ?? [];
          list.push(p.id);
          childrenMap.set(parent.id, list);
        }
      }
    }

    // Find roots (in-degree 0)
    const roots = relevantList.filter((p) => !parentMap.has(p.id));

    // Hierarchical layout with generous horizontal and vertical breathing room
    const positions = new Map<string, { x: number; y: number }>();
    let currentY = 50;

    function layoutSubtree(nodeId: string, depth: number): number {
      const children = childrenMap.get(nodeId) ?? [];
      // 390px gives ~160px horizontal gap between 230px nodes for the connector line and text badge
      const x = 50 + depth * 390;

      if (children.length === 0) {
        const y = currentY;
        currentY += 215; // Vertical space between sibling branches
        positions.set(nodeId, { x, y });
        return y;
      }

      const childYs = children.map((cId) => layoutSubtree(cId, depth + 1));
      const y = (childYs[0] + childYs[childYs.length - 1]) / 2;
      positions.set(nodeId, { x, y });
      return y;
    }

    for (const root of roots) {
      layoutSubtree(root.id, 0);
      currentY += 60; // spacing between separate roots
    }

    // Build React Flow nodes
    const flowNodes: Node[] = relevantList.map((p) => {
      const pos = positions.get(p.id) ?? { x: 50, y: 50 };
      const isActive = p.id === activePlaythrough.id;
      const isSelected = selectedPlaythrough?.id === p.id;

      return {
        id: p.id,
        type: "timelineNode",
        position: pos,
        data: {
          playthrough: p,
          isActive,
          isSelected,
          onSelect: handleSelect,
          onSwitch: handleSwitch,
        },
      };
    });

    // Build React Flow edges
    const flowEdges: Edge[] = [];
    for (const p of relevantList) {
      const parentId = parentMap.get(p.id);
      if (parentId) {
        const isPathActive = p.id === activePlaythrough.id;
        const branchLabel =
          p.createdFromTurn !== undefined ? `Branched at T${p.createdFromTurn}` : undefined;

        flowEdges.push({
          id: `edge_${parentId}_${p.id}`,
          source: parentId,
          target: p.id,
          type: "smoothstep",
          animated: isPathActive,
          label: branchLabel,
          labelShowBg: true,
          labelBgPadding: [6, 10],
          labelBgBorderRadius: 6,
          style: {
            stroke: isPathActive ? "#38bdf8" : "#475569",
            strokeWidth: isPathActive ? 2.5 : 1.5,
          },
          labelStyle: {
            fill: isPathActive ? "#38bdf8" : "#94a3b8",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
          },
          labelBgStyle: {
            fill: "#0b0f17",
            fillOpacity: 0.95,
            stroke: isPathActive ? "rgba(56, 189, 248, 0.4)" : "#334155",
            strokeWidth: 1,
            rx: 6,
            ry: 6,
          },
        });
      }
    }

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [
    open,
    playthroughs,
    activePlaythrough,
    selectedPlaythrough,
    handleSelect,
    handleSwitch,
    setNodes,
    setEdges,
  ]);

  if (!open) return null;

  const selectedIsActive = selectedPlaythrough?.id === activePlaythrough.id;
  const parentOfSelected = selectedPlaythrough?.parentBranchId
    ? playthroughs.find((p) => (p.branchId || p.id) === selectedPlaythrough.parentBranchId)
    : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal timeline-modal"
        onClick={(e) => e.stopPropagation()}
        aria-label="Timeline Branches Viewer"
      >
        <header className="timeline-modal-header">
          <div className="timeline-header-titles">
            <h2>
              <Icon name="GitFork" size={20} className="timeline-header-icon" />
              <span>Timelines & Branches</span>
            </h2>
            <p>Explore and switch between timeline branches for <strong>{activePlaythrough.name}</strong>.</p>
          </div>

          <div className="timeline-header-controls">
            <button className="timeline-close-btn" onClick={onClose} title="Close modal">
              <Icon name="X" size={16} />
            </button>
          </div>
        </header>

        {error ? (
          <div className="timeline-error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        ) : null}

        <div className="timeline-canvas-container">
          {loading ? (
            <div className="timeline-loading-overlay">
              <span>Loading timelines…</span>
            </div>
          ) : nodes.length === 0 ? (
            <div className="timeline-empty-state">
              <Icon name="GitBranch" size={40} />
              <h3>No Branches Found</h3>
              <p>
                Branch from any message in your chat to create alternative timeline paths!
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.2}
              maxZoom={1.5}
            >
              <Background color="#334155" gap={20} size={1} />
              <Controls position="top-right" />
              <MiniMap
                className="timeline-minimap"
                nodeColor={(n) =>
                  n.id === activePlaythrough.id ? "#38bdf8" : "#475569"
                }
                maskColor="rgba(15, 19, 27, 0.75)"
              />
            </ReactFlow>
          )}
        </div>

        {/* Selected Timeline Inspector Footer */}
        {selectedPlaythrough ? (
          <footer className="timeline-inspector">
            <div className="timeline-inspector-main">
              <div className="inspector-info">
                <div className="inspector-title-row">
                  {renaming ? (
                    <div className="inspector-rename-box">
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(selectedPlaythrough.id);
                          if (e.key === "Escape") setRenaming(false);
                        }}
                        autoFocus
                      />
                      <button
                        className="primary-btn"
                        onClick={() => void handleRename(selectedPlaythrough.id)}
                      >
                        Save
                      </button>
                      <button onClick={() => setRenaming(false)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <h3 title={selectedPlaythrough.name}>{selectedPlaythrough.name}</h3>
                      <button
                        className="rename-icon-btn"
                        onClick={() => {
                          setRenameDraft(selectedPlaythrough.name);
                          setRenaming(true);
                        }}
                        title="Rename timeline"
                      >
                        <Icon name="Edit3" size={13} />
                      </button>
                    </>
                  )}
                  {selectedIsActive ? (
                    <span className="inspector-active-pill">CURRENT TIMELINE</span>
                  ) : null}
                </div>

                <div className="inspector-meta-row">
                  <span>
                    <strong>Turn {selectedPlaythrough.turn}</strong>
                  </span>
                  <span>•</span>
                  <span>{selectedPlaythrough.messages.length} messages</span>
                  {selectedPlaythrough.createdFromTurn !== undefined && parentOfSelected ? (
                    <>
                      <span>•</span>
                      <span>
                        Branched from <em>{parentOfSelected.name}</em> at Turn{" "}
                        {selectedPlaythrough.createdFromTurn}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>•</span>
                      <span>Root Lineage</span>
                    </>
                  )}
                  <span>•</span>
                  <span style={{ color: selectedPlaythrough.isTimelineBranch ? "#94a3b8" : "#38bdf8" }}>
                    {selectedPlaythrough.isTimelineBranch ? "Internal Timeline" : "Standalone Playthrough"}
                  </span>
                  <span>•</span>
                  <span>
                    Updated {new Date(selectedPlaythrough.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="inspector-actions">
                {selectedPlaythrough.isTimelineBranch ? (
                  <button
                    className="timeline-action-btn promote"
                    onClick={() => void handlePromote(selectedPlaythrough.id)}
                    title="Make this branch appear as a standalone playthrough in the Save/Load menu"
                  >
                    <Icon name="ExternalLink" size={14} />
                    <span>Promote to Playthrough</span>
                  </button>
                ) : null}

                {selectedIsActive ? (
                  <button className="timeline-action-btn current" disabled>
                    Currently Active
                  </button>
                ) : (
                  <button
                    className="timeline-action-btn switch primary"
                    onClick={() => void handleSwitch(selectedPlaythrough.id)}
                  >
                    <Icon name="Play" size={14} />
                    <span>Load This Timeline</span>
                  </button>
                )}

                {!selectedIsActive ? (
                  deleteConfirmId === selectedPlaythrough.id ? (
                    <div className="delete-confirm-group">
                      <span className="confirm-text">Delete?</span>
                      <button
                        className="danger-btn confirm"
                        onClick={() => void handleDelete(selectedPlaythrough.id)}
                      >
                        Yes
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      className="timeline-action-btn delete"
                      onClick={() => setDeleteConfirmId(selectedPlaythrough.id)}
                      title="Delete this branch"
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
