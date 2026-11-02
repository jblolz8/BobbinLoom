import { useEffect, useMemo, useRef, useState } from "react";
import {
  listProviderConnections,
  type ProviderConnection,
} from "../../../../api";
import { computeLineDiff } from "../../../../engine/diff";
import {
  Accordion,
  Badge,
  Button,
  Card,
  CheckboxRow,
  FormGrid,
  Header,
  Icon,
  Modal,
  SimpleSelect,
  Spinner,
  Stack,
  StatusMessage,
  Tabs,
  Text,
  TextArea,
} from "../../../base";
import { TwoPaneDiff } from "../../../common";

export type ConvertToBLFormatOption = {
  id: string;
  name: string;
};

export type ConvertToBLModalProps = {
  title: string;
  characterName?: string;
  kind?: "convert" | "reformat" | "compare";
  oldLabel: string;
  newLabel: string;
  oldContent: string;
  newContent: string;
  onAccept?: () => void;
  onRetry?: (feedback: string) => void;
  onStopLoading?: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  formatOptions?: ConvertToBLFormatOption[];
  selectedFormatId?: string;
  onFormatChange?: (formatId: string) => void;
  selectedProviderId?: string;
  onProviderChange?: (providerId: string) => void;
  alwaysConvertImmediately?: boolean;
  onToggleAlwaysConvertImmediately?: (checked: boolean) => void;
};

export type DiffModalFormatOption = ConvertToBLFormatOption;
export type DiffModalProps = ConvertToBLModalProps;

type DiffPaneTab = "split" | "left" | "right";
type MobileModalTab = "options" | DiffPaneTab;

const QUICK_SUGGESTIONS = [
  "Make personality more detailed",
  "Keep original dialogue examples",
  "Format inventory as bullets",
  "Preserve key backstory points",
];

const MOBILE_MEDIA_QUERY = "(max-width: 680px)";

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  }
  return window.innerWidth <= 680;
}

export function ConvertToBLModal({
  title,
  characterName,
  kind = "convert",
  oldLabel,
  newLabel,
  oldContent,
  newContent,
  onAccept,
  onRetry,
  onStopLoading,
  onClose,
  loading = false,
  error = null,
  formatOptions,
  selectedFormatId,
  onFormatChange,
  selectedProviderId = "",
  onProviderChange,
  alwaysConvertImmediately = false,
  onToggleAlwaysConvertImmediately,
}: ConvertToBLModalProps) {
  const hasDraft = Boolean(newContent.trim());
  const isReadOnly = !onAccept && !onRetry;

  const diffLines = useMemo(
    () => (hasDraft ? computeLineDiff(oldContent, newContent) : []),
    [oldContent, newContent, hasDraft],
  );

  const [feedback, setFeedback] = useState("");
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileViewport());
  const [paneViewMode, setPaneViewMode] = useState<DiffPaneTab>(() => {
    if (isMobileViewport()) {
      return hasDraft || loading ? "right" : "left";
    }
    return "split";
  });
  const [mobileTab, setMobileTab] = useState<MobileModalTab>(() => {
    if (isReadOnly) return "right";
    if (hasDraft || loading) return "right";
    return "options";
  });
  const [optionsExpanded, setOptionsExpanded] = useState<boolean>(!hasDraft);

  const prevHasDraftRef = useRef<boolean>(hasDraft);
  const prevLoadingRef = useRef<boolean>(loading);
  const hasDraftRef = useRef<boolean>(hasDraft);
  hasDraftRef.current = hasDraft;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    setIsMobile(mq.matches);
    function handleViewportChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
      setPaneViewMode((prev) => {
        if (e.matches && prev === "split") {
          return hasDraftRef.current ? "right" : "left";
        }
        if (!e.matches && prev !== "split") {
          return "split";
        }
        return prev;
      });
    }
    mq.addEventListener("change", handleViewportChange);
    return () => mq.removeEventListener("change", handleViewportChange);
  }, []);

  // When loading starts, switch mobile view to the generated sheet tab so the user sees progress.
  useEffect(() => {
    if (!prevLoadingRef.current && loading) {
      setPaneViewMode((prev) => (isMobile ? "right" : prev));
      setMobileTab("right");
    }
    prevLoadingRef.current = loading;
  }, [loading, isMobile]);

  // When a draft finishes generating, collapse desktop options to maximize diff height
  // and switch mobile view to the newly generated sheet.
  useEffect(() => {
    if (!prevHasDraftRef.current && hasDraft) {
      setOptionsExpanded(false);
      if (isMobile || isMobileViewport()) {
        setPaneViewMode("right");
        setMobileTab("right");
      }
    } else if (prevHasDraftRef.current && !hasDraft) {
      setOptionsExpanded(true);
    }
    prevHasDraftRef.current = hasDraft;
  }, [hasDraft, isMobile]);

  // Expand options on desktop if an error occurs so user can adjust settings/guidance.
  useEffect(() => {
    if (error) {
      setOptionsExpanded(true);
    }
  }, [error]);

  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [activeTextProviderId, setActiveTextProviderId] = useState("");

  // ── Live Elapsed Timer ──
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      const start = Date.now();
      startTimeRef.current = start;
      setElapsedMs(0);
      const interval = window.setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 100);
      return () => {
        window.clearInterval(interval);
      };
    } else if (startTimeRef.current !== null) {
      const finalMs = Date.now() - startTimeRef.current;
      startTimeRef.current = null;
      if (finalMs > 0) {
        setLastDurationMs(finalMs);
      }
    }
  }, [loading]);

  const elapsedLabel = `${(elapsedMs / 1000).toFixed(1)}s`;
  const completedDurationLabel =
    lastDurationMs !== null ? `${(lastDurationMs / 1000).toFixed(1)}s` : null;

  useEffect(() => {
    if (isReadOnly || !onProviderChange) return;
    let cancelled = false;
    listProviderConnections()
      .then((registry) => {
        if (cancelled) return;
        setConnections(registry.connections.filter((c) => c.kind === "text"));
        setActiveTextProviderId(registry.activeTextProviderId ?? "");
      })
      .catch(() => {
        /* Fallback to active connection option */
      });
    return () => {
      cancelled = true;
    };
  }, [isReadOnly, onProviderChange]);

  const providerOptions = useMemo(() => {
    const activeConn = connections.find((c) => c.id === activeTextProviderId);
    const defaultLabel = activeConn
      ? `Active (${activeConn.label}${activeConn.model ? ` · ${activeConn.model}` : ""})`
      : "Active Provider";
    return [
      { value: "", label: defaultLabel },
      ...connections.map((c) => ({
        value: c.id,
        label: `${c.label}${c.model ? ` (${c.model})` : ""}`,
      })),
    ];
  }, [connections, activeTextProviderId]);

  const resolvedFormatId = selectedFormatId ?? (formatOptions?.[0]?.id || "");
  const selectedFormatLabel = useMemo(() => {
    const match = formatOptions?.find((f) => f.id === resolvedFormatId);
    return match?.name ?? "Default";
  }, [formatOptions, resolvedFormatId]);

  const selectedProviderLabel = useMemo(() => {
    const match = providerOptions.find((p) => p.value === selectedProviderId);
    return match?.label ?? "Active Provider";
  }, [providerOptions, selectedProviderId]);

  const addedCount = diffLines.filter((l) => l.type === "added").length;
  const removedCount = diffLines.filter((l) => l.type === "removed").length;

  const initialActionLabel =
    kind === "reformat" ? "Update Format" : "Convert to BL Format";

  const showFormatSelect = Boolean(
    !isReadOnly && formatOptions && formatOptions.length > 0 && onFormatChange,
  );
  const showProviderSelect = Boolean(
    !isReadOnly && onProviderChange && providerOptions.length > 1,
  );

  function handleMobileTabChange(tab: MobileModalTab) {
    setMobileTab(tab);
    if (tab !== "options") {
      setPaneViewMode(tab);
    }
  }

  function handleDesktopPaneChange(tab: DiffPaneTab) {
    setPaneViewMode(tab);
    setMobileTab(tab);
  }

  function handleTriggerRetry() {
    if (isMobile) {
      setMobileTab("right");
      setPaneViewMode("right");
    }
    onRetry?.(feedback);
  }

  const optionsFormContent = (
    <Stack direction="column" gap="sm" fullWidth>
      {showFormatSelect || showProviderSelect ? (
        <FormGrid cols={showFormatSelect && showProviderSelect ? 2 : 1}>
          {showFormatSelect && onFormatChange && formatOptions ? (
            <SimpleSelect<string>
              label="Target Character Format"
              size="sm"
              fullWidth
              value={resolvedFormatId}
              onChange={onFormatChange}
              disabled={loading}
              options={formatOptions.map((f) => ({
                value: f.id,
                label: f.name,
              }))}
            />
          ) : null}
          {showProviderSelect && onProviderChange ? (
            <SimpleSelect<string>
              label="AI Text Provider"
              size="sm"
              fullWidth
              value={selectedProviderId}
              onChange={onProviderChange}
              disabled={loading}
              options={providerOptions}
            />
          ) : null}
        </FormGrid>
      ) : null}

      <Stack direction="column" gap="xs" fullWidth>
        <TextArea
          rows={isMobile ? 3 : 2}
          size="sm"
          label={
            <Stack
              direction="row"
              justify="between"
              align="center"
              gap="sm"
              fullWidth
            >
              <span>Guidance for AI conversion / retry (optional)</span>
              {feedback.trim() && !loading ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setFeedback("")}
                  title="Clear guidance input"
                >
                  Clear
                </Button>
              ) : null}
            </Stack>
          }
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. Focus more on personality quirks, make appearance description more detailed, format inventory items as bullet points..."
          disabled={loading}
        />
        <Stack direction="row" gap="xs" align="center" wrap>
          <Text as="span" size="xs" tone="muted" weight="medium">
            Suggestions:
          </Text>
          {QUICK_SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="secondary"
              size="xs"
              disabled={loading}
              onClick={() => {
                setFeedback((prev) => {
                  const trimmed = prev.trim();
                  if (!trimmed) return suggestion;
                  if (trimmed.includes(suggestion)) return prev;
                  return `${trimmed}, ${suggestion.toLowerCase()}`;
                });
              }}
            >
              + {suggestion}
            </Button>
          ))}
        </Stack>
      </Stack>

      {onToggleAlwaysConvertImmediately ? (
        <CheckboxRow
          icon="Zap"
          title="Always convert right away"
          description="Automatically start AI conversion on open with the selected format and provider."
          checked={alwaysConvertImmediately}
          onChange={(e) => onToggleAlwaysConvertImmediately(e.target.checked)}
          disabled={loading}
        />
      ) : null}
    </Stack>
  );

  const showingMobileOptions =
    isMobile && !isReadOnly && mobileTab === "options";

  return (
    <Modal
      open={true}
      onClose={onClose}
      dismissDisabled={loading}
      size="wide"
      fullScreenMobile
      ariaLabelledBy="convert-to-bl-modal-title"
    >
      <Header
        variant="modal"
        bordered
        titleId="convert-to-bl-modal-title"
        icon="Sparkles"
        title={characterName ? `${title} — ${characterName}` : title}
        subtitle={
          <Stack direction="row" gap="xs" align="center" wrap>
            {loading ? (
              <Badge variant="info" size="xs" pill leftIcon="Clock">
                Generating… {elapsedLabel}
              </Badge>
            ) : hasDraft ? (
              <>
                <Badge variant="success" size="xs" pill leftIcon="Plus">
                  {addedCount} added
                </Badge>
                <Badge variant="danger" size="xs" pill leftIcon="Minus">
                  {removedCount} removed
                </Badge>
                {completedDurationLabel ? (
                  <Badge variant="neutral" size="xs" pill leftIcon="Clock">
                    Generated in {completedDurationLabel}
                  </Badge>
                ) : null}
              </>
            ) : error ? (
              <Badge variant="warning" size="xs" pill>
                Generation did not complete
              </Badge>
            ) : (
              <Badge variant="neutral" size="xs" pill>
                Ready to convert
              </Badge>
            )}
            {isReadOnly ? (
              <Badge variant="neutral" size="xs" pill>
                Read-Only
              </Badge>
            ) : null}
          </Stack>
        }
        actions={
          <Stack direction="row" gap="xs" align="center">
            <Stack hideBelow="sm">
              <Tabs<DiffPaneTab>
                variant="segmented"
                size="sm"
                ariaLabel="Diff View Mode"
                activeTab={paneViewMode}
                onChange={handleDesktopPaneChange}
                tabs={[
                  {
                    id: "split",
                    label: "Split",
                    icon: "Columns",
                  },
                  {
                    id: "right",
                    label: newLabel,
                  },
                  {
                    id: "left",
                    label: oldLabel,
                  },
                ]}
              />
            </Stack>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              leftIcon="X"
              collapseBelow="sm"
              aria-label={loading ? "Cancel" : "Close"}
              onClick={onClose}
            >
              {loading ? "Cancel" : "Close"}
            </Button>
          </Stack>
        }
      />

      {/* Pinned Mobile View / Options Switcher */}
      <Stack showBelow="sm" fullWidth>
        <Tabs<MobileModalTab>
          variant="segmented"
          size="sm"
          fullWidth
          ariaLabel="Conversion View Mode"
          activeTab={isReadOnly ? paneViewMode : mobileTab}
          onChange={handleMobileTabChange}
          tabs={
            isReadOnly
              ? [
                  { id: "right", label: newLabel },
                  { id: "left", label: oldLabel },
                  { id: "split", label: "Split", icon: "Columns" },
                ]
              : [
                  {
                    id: "options",
                    label: "Options",
                    icon: "Sliders",
                    badge: feedback.trim() ? (
                      <Badge variant="accent" size="xs" pill>
                        1
                      </Badge>
                    ) : undefined,
                  },
                  { id: "right", label: newLabel },
                  { id: "left", label: oldLabel },
                  { id: "split", label: "Split", icon: "Columns" },
                ]
          }
        />
      </Stack>

      <Modal.Body>
        <Modal.Content>
          <Stack
            direction="column"
            gap="sm"
            fullWidth
            fullHeight={!showingMobileOptions}
          >
            {error ? (
              <StatusMessage variant="banner" tone="err" autoCollapseDetail>
                {error}
              </StatusMessage>
            ) : null}

            {showingMobileOptions ? (
              <Card variant="panel" padding="sm" fullWidth>
                {optionsFormContent}
              </Card>
            ) : (
              <>
                {!isReadOnly ? (
                  <>
                    {/* Desktop Collapsible Settings Accordion */}
                    <Stack hideBelow="sm" fullWidth>
                      <Accordion
                        variant="panel"
                        size="sm"
                        icon="Sliders"
                        title="Conversion Settings & Guidance"
                        open={optionsExpanded}
                        onOpenChange={setOptionsExpanded}
                        badge={
                          <Stack direction="row" gap="xs" align="center" wrap>
                            {!optionsExpanded ? (
                              <>
                                <Badge
                                  variant="neutral"
                                  size="xs"
                                  truncate
                                  maxWidth={200}
                                >
                                  Format: {selectedFormatLabel}
                                </Badge>
                                <Badge
                                  variant="neutral"
                                  size="xs"
                                  truncate
                                  maxWidth={240}
                                >
                                  {selectedProviderLabel}
                                </Badge>
                              </>
                            ) : null}
                            {feedback.trim() ? (
                              <Badge variant="accent" size="xs">
                                Custom guidance active
                              </Badge>
                            ) : null}
                          </Stack>
                        }
                      >
                        {optionsFormContent}
                      </Accordion>
                    </Stack>

                    {/* Mobile Compact Summary Bar above Diff */}
                    <Stack showBelow="sm" fullWidth>
                      <Card variant="panel" padding="xs" fullWidth>
                        <Stack
                          direction="row"
                          justify="between"
                          align="center"
                          gap="xs"
                          fullWidth
                        >
                          <Stack
                            direction="row"
                            gap="xs"
                            align="center"
                            wrap
                            flex1
                          >
                            <Badge
                              variant="neutral"
                              size="xs"
                              truncate
                              maxWidth={130}
                            >
                              Format: {selectedFormatLabel}
                            </Badge>
                            <Badge
                              variant="neutral"
                              size="xs"
                              truncate
                              maxWidth={150}
                            >
                              {selectedProviderLabel}
                            </Badge>
                          </Stack>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            leftIcon="Sliders"
                            onClick={() => setMobileTab("options")}
                          >
                            Customize
                          </Button>
                        </Stack>
                      </Card>
                    </Stack>
                  </>
                ) : null}

                <TwoPaneDiff
                  size="fill"
                  fullViewportHeight={
                    !isMobile && !isReadOnly && optionsExpanded
                  }
                  leftLabel={oldLabel}
                  rightLabel={newLabel}
                  leftContent={oldContent}
                  rightContent={
                    hasDraft
                      ? newContent
                      : loading
                        ? `Generating structured BobbinLoom character sheet… (${elapsedLabel})`
                        : error
                          ? "Generation did not complete. Adjust format, provider, or guidance and click Retry Conversion."
                          : `Ready to convert using Format "${selectedFormatLabel}" and ${selectedProviderLabel}. Click "${initialActionLabel}" below to start AI conversion.`
                  }
                  viewMode={paneViewMode}
                  loading={loading}
                  loadingContent={
                    <Card variant="elevated" padding="md">
                      <Stack direction="column" gap="sm" align="center">
                        <Stack direction="row" gap="sm" align="center">
                          <Spinner size={18} />
                          <Text as="span" size="sm" weight="semibold">
                            {hasDraft
                              ? `Regenerating BL format… (${elapsedLabel})`
                              : `Converting to BL format… (${elapsedLabel})`}
                          </Text>
                        </Stack>
                        <Text
                          as="span"
                          size="xs"
                          tone="secondary"
                          align="center"
                        >
                          {feedback.trim()
                            ? `Guidance: "${feedback.trim()}"`
                            : `${selectedFormatLabel} · ${selectedProviderLabel}`}
                        </Text>
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          leftIcon="X"
                          onClick={onStopLoading ?? onClose}
                        >
                          Stop
                        </Button>
                      </Stack>
                    </Card>
                  }
                />
              </>
            )}
          </Stack>
        </Modal.Content>
      </Modal.Body>

      <Modal.Footer>
        {isReadOnly ? (
          <Stack
            direction="row"
            justify="between"
            align="center"
            gap="sm"
            wrap
            fullWidth
          >
            <Stack direction="row" gap="xs" align="center" hideBelow="sm">
              <Icon name="FileText" size={14} />
              <Text as="span" size="xs" tone="secondary">
                Comparing original CCv2 card with converted BobbinLoom sheet.
              </Text>
            </Stack>
            <Button
              variant="primary"
              size="sm"
              fullWidth={isMobile}
              onClick={onClose}
            >
              Close
            </Button>
          </Stack>
        ) : (
          <Stack
            direction="row"
            justify="between"
            align="center"
            gap="sm"
            wrap
            fullWidth
          >
            <Stack hideBelow="sm">
              <Text as="span" size="xs" tone="muted">
                {hasDraft
                  ? `${addedCount} lines added · ${removedCount} lines removed`
                  : `Target: ${selectedFormatLabel} · ${selectedProviderLabel}`}
              </Text>
            </Stack>

            <Stack
              direction="row"
              justify="end"
              align="center"
              gap="xs"
              flex1={isMobile}
              fullWidth={isMobile}
            >
              {isMobile ? (
                showingMobileOptions ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon="Eye"
                      onClick={() =>
                        handleMobileTabChange(hasDraft ? "right" : "left")
                      }
                    >
                      {hasDraft ? newLabel : oldLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      fullWidth
                      onClick={handleTriggerRetry}
                      disabled={loading}
                      isLoading={loading}
                      leftIcon={
                        !loading ? (
                          <Icon
                            name={hasDraft || error ? "RotateCcw" : "Sparkles"}
                            size={14}
                          />
                        ) : undefined
                      }
                    >
                      {loading
                        ? hasDraft
                          ? `Retrying… (${elapsedLabel})`
                          : `Converting… (${elapsedLabel})`
                        : hasDraft
                          ? "Retry with Guidance"
                          : error
                            ? "Retry Conversion"
                            : initialActionLabel}
                    </Button>
                  </>
                ) : hasDraft ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleTriggerRetry}
                      disabled={loading}
                      isLoading={loading}
                      leftIcon={
                        !loading ? (
                          <Icon name="RotateCcw" size={14} />
                        ) : undefined
                      }
                    >
                      {loading ? `Retrying… (${elapsedLabel})` : "Retry"}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      fullWidth
                      onClick={onAccept}
                      disabled={loading}
                      leftIcon={<Icon name="Check" size={15} />}
                    >
                      Accept &amp; Apply
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon="Sliders"
                      onClick={() => setMobileTab("options")}
                      disabled={loading}
                    >
                      Options
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      fullWidth
                      onClick={handleTriggerRetry}
                      disabled={loading}
                      isLoading={loading}
                      leftIcon={
                        !loading ? (
                          <Icon
                            name={error ? "RotateCcw" : "Sparkles"}
                            size={14}
                          />
                        ) : undefined
                      }
                    >
                      {loading
                        ? `Converting… (${elapsedLabel})`
                        : error
                          ? "Retry Conversion"
                          : initialActionLabel}
                    </Button>
                  </>
                )
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onClose}
                  >
                    {hasDraft ? "Cancel" : "Close"}
                  </Button>
                  <Button
                    type="button"
                    variant={hasDraft ? "secondary" : "primary"}
                    size="sm"
                    onClick={handleTriggerRetry}
                    disabled={loading}
                    isLoading={loading}
                    leftIcon={
                      !loading ? (
                        <Icon
                          name={hasDraft || error ? "RotateCcw" : "Sparkles"}
                          size={14}
                        />
                      ) : undefined
                    }
                    title="Generate or regenerate BL character sheet with optional guidance"
                  >
                    {loading
                      ? hasDraft
                        ? `Retrying… (${elapsedLabel})`
                        : `Converting… (${elapsedLabel})`
                      : hasDraft
                        ? "Retry with Feedback"
                        : error
                          ? "Retry Conversion"
                          : initialActionLabel}
                  </Button>
                  {hasDraft ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={onAccept}
                      disabled={loading}
                      leftIcon={<Icon name="Check" size={15} />}
                    >
                      Accept &amp; Apply
                    </Button>
                  ) : null}
                </>
              )}
            </Stack>
          </Stack>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export const DiffModal = ConvertToBLModal;
