import type { ReactNode } from "react";
import { Badge, Button, Card, Icon, Separator, SimpleSelect, Tooltip } from "../../base";
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

export type ProviderConnectionCardProps = {
  connection: ProviderConnection;
  isActive: boolean;
  sortBy: ProviderSortBy;
  onActivate: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  detailTags?: ReactNode;
  overrideTags?: ReactNode;
};

export function ProviderConnectionCard({
  connection: c,
  isActive,
  sortBy,
  onActivate,
  onEdit,
  onDuplicate,
  onRemove,
  detailTags,
  overrideTags
}: ProviderConnectionCardProps) {
  return (
    <Card
      variant={isActive ? "active" : "elevated"}
      padding="sm"
      hoverable
      className="flex flex-col gap-1.5"
    >
      {/* 1. Title & Action Buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="conn-name">{c.label}</span>
          {isActive && <Badge variant="accent" size="xs">Active</Badge>}
        </div>
        <div className="conn-actions flex items-center gap-1 shrink-0">
          <Tooltip content={isActive ? "Active connection" : "Activate connection"}>
            <Button
              variant="primary"
              size="xs"
              onClick={onActivate}
              disabled={isActive}
              aria-label={isActive ? "Active connection" : "Activate connection"}
              leftIcon={isActive ? <Icon name="Check" size={12} /> : <Icon name="Zap" size={12} />}
            >
              {isActive ? "Active" : "Activate"}
            </Button>
          </Tooltip>
          <Tooltip content="Edit connection">
            <Button
              variant="secondary"
              size="xs"
              onClick={onEdit}
              aria-label="Edit connection"
              leftIcon={<Icon name="Pencil" size={12} />}
            >
              Edit
            </Button>
          </Tooltip>
          <Tooltip content="Duplicate connection">
            <Button
              variant="secondary"
              size="xs"
              onClick={onDuplicate}
              aria-label="Duplicate connection"
              leftIcon={<Icon name="Copy" size={12} />}
            >
              Duplicate
            </Button>
          </Tooltip>
          <Tooltip content="Delete connection">
            <Button
              variant="danger"
              size="xs"
              onClick={onRemove}
              aria-label="Delete connection"
              leftIcon={<Icon name="Trash2" size={12} />}
            >
              Delete
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* 2. Connection Details Badges */}
      <div className="conn-tags">
        <Badge
          variant="neutral"
          size="xs"
          truncate
          leftIcon={<Icon name="Globe" size={12} className="ds-icon-muted" />}
          title={`Base URL: ${c.baseUrl}`}
        >
          {c.baseUrl}
        </Badge>
        <Badge
          variant="neutral"
          size="xs"
          truncate
          leftIcon={<Icon name="Zap" size={12} className="ds-icon-accent" />}
          title={`Model: ${c.model}`}
        >
          {c.model}
        </Badge>
        <Badge
          variant={c.hasApiKey ? "success" : "outline"}
          size="xs"
          leftIcon={c.hasApiKey ? <Icon name="KeyRound" size={12} /> : <Icon name="LockKeyholeOpen" size={12} />}
          title={c.hasApiKey ? "API Key configured" : "No API key configured"}
        >
          {c.hasApiKey ? c.apiKeyMasked : "No key"}
        </Badge>
        {detailTags}
        {sortBy === "lastActiveAt" && (c.lastActiveAt || isActive) ? (
          <Badge
            variant="neutral"
            size="xs"
            leftIcon={<Icon name="Activity" size={12} className="ds-icon-accent" />}
            title={c.lastActiveAt ? `Last active: ${new Date(c.lastActiveAt).toLocaleString()}` : "Currently active"}
          >
            {isActive ? "Active now" : `Active: ${formatConnDate(c.lastActiveAt)}`}
          </Badge>
        ) : sortBy === "updatedAt" && c.updatedAt ? (
          <Badge
            variant="neutral"
            size="xs"
            leftIcon={<Icon name="Clock" size={12} className="ds-icon-muted" />}
            title={`Updated: ${new Date(c.updatedAt).toLocaleString()}`}
          >
            Updated {formatConnDate(c.updatedAt)}
          </Badge>
        ) : (
          <Badge
            variant="neutral"
            size="xs"
            leftIcon={<Icon name="Calendar" size={12} className="ds-icon-muted" />}
            title={c.createdAt ? `Created: ${new Date(c.createdAt).toLocaleString()}` : "Provider connection"}
          >
            {c.createdAt ? `Added ${formatConnDate(c.createdAt)}` : "Added"}
          </Badge>
        )}
      </div>

      {/* 3. Line Separator + 4. Provider Override Badges */}
      {overrideTags && (
        <>
          <Separator spacing="xs" />
          <div className="flex flex-wrap items-center gap-1.5">
            {overrideTags}
          </div>
        </>
      )}
    </Card>
  );
}

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
  /** Kind-specific detail badges rendered in the Details row alongside URL/Model/Key/Date. */
  renderDetailTags?: (connection: ProviderConnection) => ReactNode;
  /** Workflow override badges rendered below a <Separator /> when non-null. */
  renderOverrideTags?: (connection: ProviderConnection) => ReactNode;
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
  renderDetailTags,
  renderOverrideTags
}: ProviderConnectionListProps) {
  return (
    <>
      <Card
        variant="elevated"
        padding="xs"
        className="flex items-center justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onAdd}
            leftIcon={<Icon name="Plus" size={13} />}
          >
            New Connection
          </Button>
          <Badge
            variant="info"
            size="xs"
            leftIcon={<Icon name="Zap" size={12} />}
          >
            {connections.length} {connections.length === 1 ? "provider" : "providers"}
          </Badge>
        </div>

        {connections.length > 0 && (
          <div className="flex items-center gap-1.5">
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
                onClick={onToggleSortDir}
                aria-label={`Sort order: ${sortDir === "asc" ? "Ascending" : "Descending"}`}
                leftIcon={<Icon name={sortDir === "asc" ? "ArrowUp" : "ArrowDown"} size={13} />}
              >
                {sortDir === "asc" ? "Asc" : "Desc"}
              </Button>
            </Tooltip>
          </div>
        )}
      </Card>

      <div className="conn-list">
        {connections.length === 0 ? (
          <p className="conn-empty">{emptyLabel}</p>
        ) : (
          connections.map((c) => (
            <ProviderConnectionCard
              key={c.id}
              connection={c}
              isActive={c.id === activeId}
              sortBy={sortBy}
              onActivate={() => onActivate(c.id)}
              onEdit={() => onEdit(c)}
              onDuplicate={() => onDuplicate(c.id)}
              onRemove={() => onRemove(c)}
              detailTags={renderDetailTags?.(c)}
              overrideTags={renderOverrideTags?.(c)}
            />
          ))
        )}
      </div>
    </>
  );
}
