import type { ReactNode } from "react";
import { Badge, Button, Icon, SimpleSelect, Tooltip } from "../../base";
import type { ProviderConnection } from "../../../api";

export type ProviderSortBy = "lastActiveAt" | "label" | "updatedAt" | "createdAt";
export type SortDirection = "asc" | "desc";

const SORT_OPTIONS: Array<{ value: ProviderSortBy; label: string }> = [
  { value: "lastActiveAt", label: "Last Active" },
  { value: "label", label: "Provider Name" },
  { value: "updatedAt", label: "Last Updated" },
  { value: "createdAt", label: "Created At" },
];

function formatConnDate(isoOrStr?: string): string {
  if (!isoOrStr) return "";
  try {
    const d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "";
  }
}

/**
 * The list half of Settings → Provider: count label, sort controls, the cards,
 * and the Add button. Presentational only — every fetch, piece of state and
 * confirmation dialog lives in `ProviderConnections`, which is also what makes
 * this shell usable for both provider kinds.
 *
 * The kind-specific part of a card is `renderTags` (the image rows add API
 * style / safe mode / prompt-writer tags). A generic single-card component was
 * deliberately not built: the two kinds' tags and their editors differ enough
 * that one component would be a bag of conditionals.
 */
export type ProviderConnectionListProps = {
  connections: ProviderConnection[];
  activeId: string;
  sortBy: ProviderSortBy;
  sortDir: SortDirection;
  onSortByChange: (value: ProviderSortBy) => void;
  onToggleSortDir: () => void;
  onActivate: (id: string) => void;
  onEdit: (connection: ProviderConnection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (connection: ProviderConnection) => void;
  onAdd: () => void;
  /** Shown when this kind has no connections yet. */
  emptyLabel: string;
  /** Extra badges for the card's tag row (kind-specific). */
  renderTags: (connection: ProviderConnection) => ReactNode;
};

export function ProviderConnectionList({
  connections,
  activeId,
  sortBy,
  sortDir,
  onSortByChange,
  onToggleSortDir,
  onActivate,
  onEdit,
  onDuplicate,
  onRemove,
  onAdd,
  emptyLabel,
  renderTags
}: ProviderConnectionListProps) {
  return (
    <>
      {connections.length > 0 && (
        <div className="conn-toolbar">
          <div className="conn-count-label">
            <span>{connections.length}</span> {connections.length === 1 ? "provider" : "providers"}
          </div>
          <div className="conn-sort-group">
            <label htmlFor="conn-sort-select" className="conn-sort-label">
              <Icon name="ArrowUpDown" size={13} />
              <span>Sort:</span>
            </label>
            <SimpleSelect<ProviderSortBy>
              id="conn-sort-select"
              size="xs"
              value={sortBy}
              onChange={onSortByChange}
              options={SORT_OPTIONS}
              aria-label="Sort providers by"
            />
            <Tooltip content={`Sort order: ${sortDir === "asc" ? "Ascending" : "Descending"} (click to toggle)`}>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                className="conn-sort-dir-btn"
                onClick={onToggleSortDir}
                aria-label={`Sort order: ${sortDir === "asc" ? "Ascending" : "Descending"}`}
                leftIcon={<Icon name={sortDir === "asc" ? "ArrowUp" : "ArrowDown"} size={14} />}
              >
                <span className="sort-dir-text">{sortDir === "asc" ? "Asc" : "Desc"}</span>
              </Button>
            </Tooltip>
          </div>
        </div>
      )}

      <div className="conn-list">
        {connections.length === 0 ? (
          <p className="conn-empty">{emptyLabel}</p>
        ) : connections.map((c) => {
          const isActive = c.id === activeId;
          return (
            <div key={c.id} className={`conn-card ${isActive ? "active" : ""}`}>
              <div className="conn-card-body">
                <div className="conn-card-header">
                  <div className="conn-title-group">
                    <span className="conn-name">{c.label}</span>
                    {isActive && <Badge variant="accent" size="xs">Active</Badge>}
                  </div>
                  <div className="conn-actions">
                    <Tooltip content={isActive ? "Active connection" : "Activate connection"}>
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => onActivate(c.id)}
                        disabled={isActive}
                        aria-label={isActive ? "Active connection" : "Activate connection"}
                      >
                        <span className="btn-label flex items-center gap-1.5">
                          <span className="btn-icon">{isActive ? <Icon name="Check" size={13} /> : <Icon name="Zap" size={13} />}</span>
                          <span>{isActive ? "Active" : "Activate"}</span>
                        </span>
                        <span className="btn-icon-only" aria-hidden="true">
                          {isActive ? <Icon name="Check" size={14} /> : <Icon name="Zap" size={14} />}
                        </span>
                      </Button>
                    </Tooltip>
                    <Tooltip content="Edit connection">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => onEdit(c)}
                        aria-label="Edit connection"
                      >
                        <span className="btn-label flex items-center gap-1.5">
                          <span className="btn-icon"><Icon name="Pencil" size={13} /></span>
                          <span>Edit</span>
                        </span>
                        <span className="btn-icon-only" aria-hidden="true">
                          <Icon name="Pencil" size={14} />
                        </span>
                      </Button>
                    </Tooltip>
                    <Tooltip content="Duplicate connection">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => onDuplicate(c.id)}
                        aria-label="Duplicate connection"
                      >
                        <span className="btn-label flex items-center gap-1.5">
                          <span className="btn-icon"><Icon name="Copy" size={13} /></span>
                          <span>Duplicate</span>
                        </span>
                        <span className="btn-icon-only" aria-hidden="true">
                          <Icon name="Copy" size={14} />
                        </span>
                      </Button>
                    </Tooltip>
                    <Tooltip content="Delete connection">
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => onRemove(c)}
                        aria-label="Delete connection"
                      >
                        <span className="btn-label flex items-center gap-1.5">
                          <span className="btn-icon"><Icon name="Trash2" size={13} /></span>
                          <span>Delete</span>
                        </span>
                        <span className="btn-icon-only" aria-hidden="true">
                          <Icon name="Trash2" size={14} />
                        </span>
                      </Button>
                    </Tooltip>
                  </div>
                </div>
                <div className="conn-tags">
                  <Badge className="conn-tag" leftIcon={<Icon name="Globe" size={13} className="text-slate-400" />} title={`Base URL: ${c.baseUrl}`}>
                    {c.baseUrl}
                  </Badge>
                  <Badge className="conn-tag" leftIcon={<Icon name="Zap" size={13} className="text-amber-400" style={{ color: "var(--status-warning, #fbbf24)" }} />} title={`Model: ${c.model}`}>
                    {c.model}
                  </Badge>
                  <Badge className={`conn-tag ${c.hasApiKey ? "has-key" : "no-key"}`} variant={c.hasApiKey ? "success" : "neutral"} leftIcon={c.hasApiKey ? <Icon name="KeyRound" size={13} /> : <Icon name="LockKeyholeOpen" size={13} className="text-slate-500" />} title={c.hasApiKey ? "API Key configured" : "No API key configured"}>
                    {c.hasApiKey ? c.apiKeyMasked : "No key"}
                  </Badge>
                  {renderTags(c)}
                  {sortBy === "lastActiveAt" && (c.lastActiveAt || isActive) ? (
                    <Badge className="conn-tag date-tag" leftIcon={<Icon name="Activity" size={13} className="text-blue-400" />} title={c.lastActiveAt ? `Last active: ${new Date(c.lastActiveAt).toLocaleString()}` : "Currently active"}>
                      {isActive ? "Active now" : `Active: ${formatConnDate(c.lastActiveAt)}`}
                    </Badge>
                  ) : sortBy === "updatedAt" && c.updatedAt ? (
                    <Badge className="conn-tag date-tag" leftIcon={<Icon name="Clock" size={13} className="text-indigo-400" />} title={`Updated: ${new Date(c.updatedAt).toLocaleString()}`}>
                      Updated {formatConnDate(c.updatedAt)}
                    </Badge>
                  ) : (
                    <Badge className="conn-tag date-tag" leftIcon={<Icon name="Calendar" size={13} className="text-emerald-400" />} title={c.createdAt ? `Created: ${new Date(c.createdAt).toLocaleString()}` : "Provider connection"}>
                      {c.createdAt ? `Added ${formatConnDate(c.createdAt)}` : "Added"}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button variant="secondary" fullWidth className="conn-add" onClick={onAdd} leftIcon={<Icon name="Plus" size={16} />}>
        Add connection
      </Button>
    </>
  );
}
