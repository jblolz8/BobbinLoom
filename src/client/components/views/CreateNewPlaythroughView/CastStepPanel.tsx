import type { CharacterTemplate } from "../../../../schemas";
import type { PageSize } from "../../../engine/pagination";
import {
  cardBadgeLabel,
  displayTitle,
  getGroupCreatedAt,
  getGroupUpdatedAt,
  groupByLineage,
  hasDistinctTitle,
  type CharacterSortOption,
  type SortDirection,
} from "../../../../engine/characterCards";
import {
  sortTags,
  type TagTaxonomyConfig,
} from "../../../../engine/tagTaxonomy";
import {
  Badge,
  Button,
  Card,
  CharacterAvatar,
  FormGrid,
  Icon,
  IconButton,
  Pagination,
  SearchBar,
  Separator,
  SortSelect,
  Stack,
  Tabs,
  TagChip,
  TagRow,
  TagSidebar,
  Text,
  Tooltip,
} from "../../base";
import type { ViewMode } from "../../library/CharacterLibrary";

type CharacterGroup = ReturnType<typeof groupByLineage>[number];

function formatCastDate(isoOrStr?: string): string {
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

export type CastStepPanelProps = {
  castLibraryCount: number;
  filteredCastCount: number;
  paginatedCastGroups: CharacterGroup[];
  selectedCastIds: string[];
  selectedCastTemplates: CharacterTemplate[];
  onToggleCastId: (id: string) => void;
  onSelectAllFilteredCast: () => void;
  onClearCast: () => void;
  castSearch: string;
  onChangeCastSearch: (val: string) => void;
  sortBy: CharacterSortOption;
  onChangeSortBy: (option: CharacterSortOption) => void;
  sortDirection: SortDirection;
  onToggleSortDirection: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  taxonomyConfig: TagTaxonomyConfig | null;
  allTagCounts: Array<{ tag: string; count: number }>;
  activeFilterTags: string[];
  onToggleTag: (tag: string) => void;
  onRemoveFilterTag: (tag: string) => void;
  sidebarViewMode: "grouped" | "flat";
  onChangeSidebarViewMode: (mode: "grouped" | "flat") => void;
  collapsedCategories: Set<string>;
  onToggleCategoryCollapse: (categoryId: string) => void;
  page: number;
  pageSize: PageSize;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  onCommitCustomPageSize: (raw: string) => boolean;
};

export function CastStepPanel({
  castLibraryCount,
  filteredCastCount,
  paginatedCastGroups,
  selectedCastIds,
  selectedCastTemplates,
  onToggleCastId,
  onSelectAllFilteredCast,
  onClearCast,
  castSearch,
  onChangeCastSearch,
  sortBy,
  onChangeSortBy,
  sortDirection,
  onToggleSortDirection,
  viewMode,
  onChangeViewMode,
  taxonomyConfig,
  allTagCounts,
  activeFilterTags,
  onToggleTag,
  onRemoveFilterTag,
  sidebarViewMode,
  onChangeSidebarViewMode,
  collapsedCategories,
  onToggleCategoryCollapse,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onCommitCustomPageSize,
}: CastStepPanelProps) {
  const selectedCastCount = selectedCastIds.length;

  const paginationElement = (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={totalItems}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onCommitCustomPageSize={onCommitCustomPageSize}
      itemLabel="characters"
    />
  );

  function renderCastBadges(
    group: CharacterGroup,
    latest: CharacterTemplate,
    badge: ReturnType<typeof cardBadgeLabel>,
  ) {
    return (
      <>
        {hasDistinctTitle(latest) ? (
          <Badge
            variant="outline"
            size="xs"
            leftIcon="User"
            title={`In-story character name used by the AI: ${latest.name}`}
          >
            {latest.name}
          </Badge>
        ) : null}
        {badge === "ccv2" ? (
          <Badge variant="warning" size="xs">
            CCv2
          </Badge>
        ) : null}
        {badge === "ccv2bl" ? (
          <Badge variant="info" size="xs">
            CCv2 / BL
          </Badge>
        ) : null}
        {badge === null ? (
          <Badge variant="accent" size="xs">
            BL
          </Badge>
        ) : null}
        {latest.cardVersion?.trim() ? (
          <Badge variant="neutral" size="xs">
            {latest.cardVersion.trim()}
          </Badge>
        ) : null}
        {group.versions.length > 1 ? (
          <Badge variant="neutral" size="xs">
            {group.versions.length} versions
          </Badge>
        ) : null}
      </>
    );
  }

  function renderCastDate(group: CharacterGroup) {
    const isCreated = sortBy === "createdAt";
    const rawIso = isCreated
      ? getGroupCreatedAt(group)
      : getGroupUpdatedAt(group) || getGroupCreatedAt(group);
    const shortDate = formatCastDate(rawIso);
    if (!rawIso || !shortDate) return null;
    const fullTimestamp = `${isCreated ? "Created" : "Updated"}: ${new Date(rawIso).toLocaleString()}`;
    return (
      <Card.Interactive>
        <Tooltip content={fullTimestamp}>
          <Text as="span" size="xs" tone="muted" truncate>
            {shortDate}
          </Text>
        </Tooltip>
      </Card.Interactive>
    );
  }

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {/* Selected Cast Shelf Tray */}
      <Card variant="elevated" padding="sm" fullWidth>
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            fullWidth
          >
            <Stack direction="row" align="center" gap="xs">
              <Icon name="UserCheck" size={15} />
              <Text size="sm" weight="semibold">
                Selected Cast ({selectedCastCount})
              </Text>
            </Stack>

            {selectedCastCount > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={onClearCast}
                title="Deselect all characters"
              >
                Clear Selection
              </Button>
            ) : null}
          </Stack>

          {selectedCastTemplates.length === 0 ? (
            <Text size="xs" tone="muted" italic>
              No characters selected yet. Click cards below to add them to your
              starting party, or proceed solo.
            </Text>
          ) : (
            <Stack
              direction="row"
              align="center"
              gap="xs"
              wrap
              scrollable
              fullWidth
            >
              {selectedCastTemplates.map((t) => (
                <Badge
                  key={t.id}
                  variant="accent"
                  size="md"
                  pill
                  truncate
                  maxWidth={220}
                  title={displayTitle(t)}
                  leftIcon={<CharacterAvatar template={t} variant="chip" />}
                  rightIcon={
                    <IconButton
                      icon="X"
                      size="xs"
                      variant="ghost"
                      onClick={() => onToggleCastId(t.id)}
                      label={`Remove ${displayTitle(t)}`}
                      title={`Remove ${displayTitle(t)}`}
                    />
                  }
                >
                  {displayTitle(t)}
                </Badge>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      {/* Main Cast Gallery with Booru TagSidebar */}
      <Stack direction="row" align="start" gap="md" fullWidth stackBelow="md">
        <TagSidebar
          taxonomy="character"
          userConfig={taxonomyConfig}
          tagCounts={allTagCounts}
          activeTags={activeFilterTags}
          onToggleTag={onToggleTag}
          onClearTags={
            castSearch.trim() ? () => onChangeCastSearch("") : undefined
          }
          mode={sidebarViewMode}
          onModeChange={onChangeSidebarViewMode}
          collapsedCategories={collapsedCategories}
          onToggleCategory={onToggleCategoryCollapse}
        />

        <Stack direction="column" align="stretch" gap="sm" flex1 fullWidth>
          {/* Cast Library Toolbar */}
          <Card variant="elevated" padding="xs" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
              fullWidth
            >
              <SearchBar
                value={castSearch}
                onChange={onChangeCastSearch}
                onClear={() => onChangeCastSearch("")}
                placeholder="Search cast by name, tag (e.g. species:elf), creator…"
                size="sm"
                flex1
                aria-label="Search cast"
              />

              <Button
                variant="secondary"
                size="xs"
                onClick={onSelectAllFilteredCast}
                disabled={filteredCastCount === 0}
                title="Select all filtered characters"
              >
                Select All
              </Button>

              <SortSelect<CharacterSortOption>
                value={sortBy}
                onChange={onChangeSortBy}
                direction={sortDirection}
                onToggleDirection={onToggleSortDirection}
                options={[
                  { value: "name", label: "Name" },
                  { value: "createdAt", label: "Created Date" },
                  { value: "updatedAt", label: "Updated Date" },
                ]}
                size="sm"
                groupAriaLabel="Sort cast"
                aria-label="Sort cast by"
              />

              <Tabs<ViewMode>
                variant="segmented"
                size="sm"
                activeTab={viewMode}
                onChange={onChangeViewMode}
                ariaLabel="Cast view mode"
                tabs={[
                  { id: "portrait", label: "Portrait", icon: "IdCard" },
                  { id: "list", label: "List", icon: "List" },
                  { id: "grid", label: "Grid", icon: "LayoutGrid" },
                ]}
              />
            </Stack>
          </Card>

          {/* Active Filter Chips Bar */}
          {activeFilterTags.length > 0 ? (
            <Card variant="panel" padding="xs" fullWidth>
              <Stack direction="row" align="center" gap="xs" wrap>
                <Text variant="overline" size="2xs" tone="muted">
                  Active filters:
                </Text>
                {activeFilterTags.map((tag) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    userConfig={taxonomyConfig}
                    active
                    size="sm"
                    onRemove={() => onRemoveFilterTag(tag)}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onChangeCastSearch("")}
                >
                  Clear all
                </Button>
              </Stack>
            </Card>
          ) : null}

          {/* Character Cards Display */}
          {castLibraryCount === 0 ? (
            <Card variant="panel" padding="lg" fullWidth>
              <Stack direction="column" align="center" gap="sm">
                <Icon name="Users" size={28} />
                <Text size="md" weight="semibold">
                  No characters in library
                </Text>
                <Text size="sm" tone="secondary" align="center">
                  You can start a fresh adventure without starting cast, or
                  create characters in the Character Library.
                </Text>
              </Stack>
            </Card>
          ) : filteredCastCount === 0 ? (
            <Card variant="panel" padding="lg" fullWidth>
              <Stack direction="column" align="center" gap="sm">
                <Icon name="SearchX" size={28} />
                <Text size="md" weight="semibold">
                  No characters match &ldquo;{castSearch}&rdquo;
                </Text>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onChangeCastSearch("")}
                >
                  Clear Search
                </Button>
              </Stack>
            </Card>
          ) : (
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              {totalPages > 1 ? paginationElement : null}

              {/* 1. Portrait View */}
              {viewMode === "portrait" && (
                <FormGrid cols="portrait" gap="md">
                  {paginatedCastGroups.map((group) => {
                    const latest = group.versions[0];
                    const isCcv2 = latest.format === "ccv2";
                    const isSelected = selectedCastIds.includes(latest.id);
                    const badge = cardBadgeLabel(latest);
                    const sortedTags = sortTags(
                      latest.tags ?? [],
                      taxonomyConfig,
                    );

                    return (
                      <Card
                        key={group.key}
                        as="article"
                        variant="panel"
                        padding="none"
                        layout="column"
                        hoverable={!isCcv2}
                        active={isSelected}
                        dimmed={isCcv2}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={isCcv2}
                        tabIndex={!isCcv2 ? 0 : -1}
                        onClick={
                          !isCcv2 ? () => onToggleCastId(latest.id) : undefined
                        }
                        onKeyDown={(e) => {
                          if (!isCcv2 && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            onToggleCastId(latest.id);
                          }
                        }}
                      >
                        <Card.Cover
                          position="top"
                          aspect="portrait"
                          overlay={
                            !isCcv2 ? (
                              <Card.SelectIndicator checked={isSelected} />
                            ) : undefined
                          }
                        >
                          <CharacterAvatar
                            template={latest}
                            variant="portrait"
                          />
                        </Card.Cover>

                        <Card.Body padding="sm" gap="xs">
                          <Stack
                            direction="row"
                            align="start"
                            justify="between"
                            gap="xs"
                            fullWidth
                          >
                            <Text
                              as="span"
                              size="md"
                              weight="semibold"
                              lineClamp={2}
                              title={displayTitle(latest)}
                            >
                              {displayTitle(latest)}
                            </Text>
                          </Stack>

                          <Stack
                            direction="row"
                            align="center"
                            justify="between"
                            gap="2xs"
                            wrap
                            fullWidth
                          >
                            <Stack
                              direction="row"
                              align="center"
                              gap="2xs"
                              wrap
                            >
                              {renderCastBadges(group, latest, badge)}
                            </Stack>
                            {renderCastDate(group)}
                          </Stack>

                          {latest.creator?.trim() ? (
                            <Text as="span" size="xs" tone="muted" italic>
                              by {latest.creator.trim()}
                            </Text>
                          ) : null}

                          {isCcv2 ? (
                            <Badge variant="warning" size="xs">
                              Convert to BL in library to select
                            </Badge>
                          ) : null}

                          {sortedTags.length > 0 ? (
                            <>
                              <Separator spacing="none" />
                              <TagRow
                                taxonomy="character"
                                userConfig={taxonomyConfig}
                                tags={sortedTags}
                                activeTags={activeFilterTags}
                                maxRows={3}
                                onToggleTag={onToggleTag}
                              />
                            </>
                          ) : null}
                        </Card.Body>
                      </Card>
                    );
                  })}
                </FormGrid>
              )}

              {/* 2. List View */}
              {viewMode === "list" && (
                <Stack direction="column" align="stretch" gap="sm" fullWidth>
                  {paginatedCastGroups.map((group) => {
                    const latest = group.versions[0];
                    const isCcv2 = latest.format === "ccv2";
                    const isSelected = selectedCastIds.includes(latest.id);
                    const badge = cardBadgeLabel(latest);
                    const sortedTags = sortTags(
                      latest.tags ?? [],
                      taxonomyConfig,
                    );

                    return (
                      <Card
                        key={group.key}
                        as="article"
                        variant="panel"
                        padding="sm"
                        layout="row"
                        hoverable={!isCcv2}
                        active={isSelected}
                        dimmed={isCcv2}
                        fullWidth
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={isCcv2}
                        tabIndex={!isCcv2 ? 0 : -1}
                        onClick={
                          !isCcv2 ? () => onToggleCastId(latest.id) : undefined
                        }
                        onKeyDown={(e) => {
                          if (!isCcv2 && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            onToggleCastId(latest.id);
                          }
                        }}
                      >
                        <CharacterAvatar template={latest} variant="list" />
                        <Stack
                          direction="column"
                          align="stretch"
                          gap="xs"
                          flex1
                          fullWidth
                        >
                          <Stack
                            direction="row"
                            align="start"
                            justify="between"
                            gap="sm"
                            fullWidth
                          >
                            <Text
                              as="span"
                              size="md"
                              weight="semibold"
                              lineClamp={2}
                              title={displayTitle(latest)}
                            >
                              {displayTitle(latest)}
                            </Text>
                            {!isCcv2 ? (
                              <Card.SelectIndicator checked={isSelected} />
                            ) : null}
                          </Stack>

                          <Stack
                            direction="row"
                            align="center"
                            justify="between"
                            gap="xs"
                            wrap
                            fullWidth
                          >
                            <Stack direction="row" align="center" gap="xs" wrap>
                              {renderCastBadges(group, latest, badge)}
                              {latest.creator?.trim() ? (
                                <Text as="span" size="xs" tone="muted" italic>
                                  by {latest.creator.trim()}
                                </Text>
                              ) : null}
                              {isCcv2 ? (
                                <Badge variant="warning" size="xs">
                                  Convert to BL in library to select
                                </Badge>
                              ) : null}
                            </Stack>
                            {renderCastDate(group)}
                          </Stack>

                          {sortedTags.length > 0 ? (
                            <>
                              <Separator spacing="none" />
                              <TagRow
                                taxonomy="character"
                                userConfig={taxonomyConfig}
                                tags={sortedTags}
                                activeTags={activeFilterTags}
                                maxRows={3}
                                onToggleTag={onToggleTag}
                              />
                            </>
                          ) : null}
                        </Stack>
                      </Card>
                    );
                  })}
                </Stack>
              )}

              {/* 3. Grid View */}
              {viewMode === "grid" && (
                <FormGrid cols="compact" gap="sm">
                  {paginatedCastGroups.map((group) => {
                    const latest = group.versions[0];
                    const isCcv2 = latest.format === "ccv2";
                    const isSelected = selectedCastIds.includes(latest.id);
                    const badge = cardBadgeLabel(latest);
                    const sortedTags = sortTags(
                      latest.tags ?? [],
                      taxonomyConfig,
                    );

                    return (
                      <Card
                        key={group.key}
                        as="article"
                        variant="panel"
                        padding="none"
                        layout="column"
                        hoverable={!isCcv2}
                        active={isSelected}
                        dimmed={isCcv2}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={isCcv2}
                        tabIndex={!isCcv2 ? 0 : -1}
                        onClick={
                          !isCcv2 ? () => onToggleCastId(latest.id) : undefined
                        }
                        onKeyDown={(e) => {
                          if (!isCcv2 && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            onToggleCastId(latest.id);
                          }
                        }}
                      >
                        <Card.Cover
                          position="top"
                          aspect="square"
                          overlay={
                            !isCcv2 ? (
                              <Card.SelectIndicator checked={isSelected} />
                            ) : undefined
                          }
                        >
                          <CharacterAvatar template={latest} variant="grid" />
                        </Card.Cover>

                        <Card.Body padding="sm" gap="xs">
                          <Text
                            as="span"
                            size="sm"
                            weight="semibold"
                            lineClamp={2}
                            title={displayTitle(latest)}
                          >
                            {displayTitle(latest)}
                          </Text>

                          <Stack
                            direction="row"
                            align="center"
                            justify="between"
                            gap="2xs"
                            wrap
                            fullWidth
                          >
                            <Stack
                              direction="row"
                              align="center"
                              gap="2xs"
                              wrap
                            >
                              {renderCastBadges(group, latest, badge)}
                            </Stack>
                            {renderCastDate(group)}
                          </Stack>

                          {isCcv2 ? (
                            <Badge variant="warning" size="xs">
                              Convert to BL
                            </Badge>
                          ) : null}

                          {sortedTags.length > 0 ? (
                            <>
                              <Separator spacing="none" />
                              <TagRow
                                taxonomy="character"
                                userConfig={taxonomyConfig}
                                tags={sortedTags}
                                activeTags={activeFilterTags}
                                maxRows={1}
                                onToggleTag={onToggleTag}
                              />
                            </>
                          ) : null}
                        </Card.Body>
                      </Card>
                    );
                  })}
                </FormGrid>
              )}

              {paginationElement}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
