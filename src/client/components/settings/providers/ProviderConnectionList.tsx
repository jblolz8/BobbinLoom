import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  Separator,
  SimpleSelect,
  Stack,
  Text,
} from "../../base";
import type { ProviderConnection } from "../../../api";

export type ProviderSortBy =
  | "lastActiveAt"
  | "label"
  | "updatedAt"
  | "createdAt";
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
      year: "numeric",
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
  headerTags?: ReactNode;
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
  headerTags,
  detailTags,
  overrideTags,
}: ProviderConnectionCardProps) {
  return (
    <Card variant={isActive ? "active" : "elevated"} padding="sm" hoverable>
      <Stack direction="column" align="stretch" gap="xs">
        {/* 1. Identity Header: Full-width Connection Name + Source/Dialect & Active Badges */}
        <Stack direction="row" align="center" justify="between" gap="xs" wrap>
          <Text as="span" size="md" weight="semibold" tone="primary">
            {c.label}
          </Text>
          <Stack direction="row" align="center" gap="2xs" wrap>
            {headerTags}
            {isActive && (
              <Badge variant="accent" size="xs" leftIcon="Check">
                Active
              </Badge>
            )}
          </Stack>
        </Stack>

        {/* 2. Action Buttons + Activity/Date Timestamp */}
        <Stack direction="row" align="center" justify="between" gap="xs" wrap>
          <Stack
            direction="row"
            align="center"
            gap="2xs"
            wrap
            className="conn-actions"
          >
            <Button
              variant="primary"
              size="xs"
              onClick={onActivate}
              disabled={isActive}
              collapseBelow="xs"
              tooltip={isActive ? "Active connection" : "Activate connection"}
              aria-label={
                isActive ? "Active connection" : "Activate connection"
              }
              leftIcon={isActive ? "Check" : "Zap"}
            >
              {isActive ? "Active" : "Activate"}
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={onEdit}
              collapseBelow="sm"
              tooltip="Edit connection"
              aria-label="Edit connection"
              leftIcon="Pencil"
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={onDuplicate}
              collapseBelow="sm"
              tooltip="Duplicate connection"
              aria-label="Duplicate connection"
              leftIcon="Copy"
            >
              Duplicate
            </Button>
            <Button
              variant="danger"
              size="xs"
              onClick={onRemove}
              collapseBelow="sm"
              tooltip="Delete connection"
              aria-label="Delete connection"
              leftIcon="Trash2"
            >
              Delete
            </Button>
          </Stack>

          {sortBy === "lastActiveAt" && (c.lastActiveAt || isActive) ? (
            <Badge
              variant="neutral"
              size="xs"
              leftIcon="Activity"
              title={
                c.lastActiveAt
                  ? `Last active: ${new Date(c.lastActiveAt).toLocaleString()}`
                  : "Currently active"
              }
            >
              {isActive
                ? "Active now"
                : `Active: ${formatConnDate(c.lastActiveAt)}`}
            </Badge>
          ) : sortBy === "updatedAt" && c.updatedAt ? (
            <Badge
              variant="neutral"
              size="xs"
              leftIcon="Clock"
              title={`Updated: ${new Date(c.updatedAt).toLocaleString()}`}
            >
              Updated {formatConnDate(c.updatedAt)}
            </Badge>
          ) : (
            <Badge
              variant="neutral"
              size="xs"
              leftIcon="Calendar"
              title={
                c.createdAt
                  ? `Created: ${new Date(c.createdAt).toLocaleString()}`
                  : "Provider connection"
              }
            >
              {c.createdAt ? `Added ${formatConnDate(c.createdAt)}` : "Added"}
            </Badge>
          )}
        </Stack>

        {/* 3. Connection Details Badges (Natural Wrapping Flex Row) */}
        <Stack direction="row" align="center" gap="xs" wrap>
          <Badge
            variant="neutral"
            size="xs"
            truncate
            maxWidth={280}
            leftIcon="Globe"
            title={`Base URL: ${c.baseUrl}`}
          >
            {c.baseUrl}
          </Badge>
          <Badge
            variant="neutral"
            size="xs"
            truncate
            maxWidth={240}
            leftIcon="Zap"
            title={`Model: ${c.model}`}
          >
            {c.model}
          </Badge>
          <Badge
            variant={c.hasApiKey ? "success" : "outline"}
            size="xs"
            leftIcon={c.hasApiKey ? "KeyRound" : "LockKeyholeOpen"}
            title={c.hasApiKey ? "API Key configured" : "No API key configured"}
          >
            {c.hasApiKey ? c.apiKeyMasked : "No key"}
          </Badge>
          {detailTags}
        </Stack>

        {/* 4. Line Separator + Provider Override Badges */}
        {overrideTags && (
          <>
            <Separator spacing="xs" />
            <Stack direction="row" align="center" gap="2xs" wrap>
              {overrideTags}
            </Stack>
          </>
        )}
      </Stack>
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
  /** Kind-specific identity badges rendered in the card header (e.g. Source / API Dialect). */
  renderHeaderTags?: (connection: ProviderConnection) => ReactNode;
  /** Kind-specific technical detail badges rendered in the Specs row alongside URL/Model/Key. */
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
  renderHeaderTags,
  renderDetailTags,
  renderOverrideTags,
}: ProviderConnectionListProps) {
  return (
    <>
      <Card variant="elevated" padding="xs">
        <Stack direction="row" align="center" justify="between" gap="sm" wrap>
          <Stack direction="row" align="center" gap="xs" wrap>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onAdd}
              leftIcon="Plus"
            >
              New Connection
            </Button>
            <Badge variant="info" size="xs" leftIcon="Zap">
              {connections.length}{" "}
              {connections.length === 1 ? "provider" : "providers"}
            </Badge>
          </Stack>

          {connections.length > 0 && (
            <Stack direction="row" align="center" gap="2xs">
              <Text
                as="label"
                htmlFor="conn-sort-select"
                size="xs"
                tone="secondary"
              >
                <Stack direction="row" align="center" gap="2xs" inline>
                  <Icon name="ArrowUpDown" size={13} />
                  <span>Sort:</span>
                </Stack>
              </Text>
              <SimpleSelect<ProviderSortBy>
                id="conn-sort-select"
                size="xs"
                value={sortBy}
                onChange={onSortByChange}
                options={SORT_OPTIONS}
                aria-label="Sort providers by"
              />
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={onToggleSortDir}
                tooltip={`Sort order: ${sortDir === "asc" ? "Ascending" : "Descending"} (click to toggle)`}
                aria-label={`Sort order: ${sortDir === "asc" ? "Ascending" : "Descending"}`}
                leftIcon={sortDir === "asc" ? "ArrowUp" : "ArrowDown"}
              >
                {sortDir === "asc" ? "Asc" : "Desc"}
              </Button>
            </Stack>
          )}
        </Stack>
      </Card>

      <Stack direction="column" align="stretch" gap="xs">
        {connections.length === 0 ? (
          <Text as="p" size="sm" tone="secondary">
            {emptyLabel}
          </Text>
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
              headerTags={renderHeaderTags?.(c)}
              detailTags={renderDetailTags?.(c)}
              overrideTags={renderOverrideTags?.(c)}
            />
          ))
        )}
      </Stack>
    </>
  );
}
