import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterFormat, CharacterTemplate } from "../../../../../schemas";
import {
  brainstormCharacter,
  clearBrainstormSession,
  createCharacter,
  deleteCharacterProfileAvatar,
  getBrainstormSession,
  getBrainstormSettings,
  getCharacterAvatarUrl,
  restoreOriginalCharacterAvatar,
  saveBrainstormSession,
  setBrainstormSettings,
  suggestCharacterTags,
  updateCharacter,
  uploadCharacterAvatar,
  type CharacterBrainstormResult,
  type CharacterTemplateUpdate,
  type Preset,
  type ProposedSectionChange,
} from "../../../../api";
import {
  brainstormHistoryContent,
  brainstormStorageKey,
  decodeLegacyBrainstormSession,
  isBrainstormMessage,
  trimBrainstormMessages,
} from "../../../../../engine/brainstorm";
import { displayTitle } from "../../../../../engine/characterCards";
import { isFormatAligned } from "../../../../../engine/characterFormat";
import {
  CHARACTER_SHEET_EXAMPLE,
  applySectionChanges,
} from "../../../../../engine/characterSections";
import {
  sortTags,
  type TagTaxonomyConfig,
} from "../../../../../engine/tagTaxonomy";
import {
  Badge,
  Button,
  Card,
  FormGrid,
  Header,
  Icon,
  Separator,
  SimpleSelect,
  Stack,
  Tabs,
  TagChip,
  TagInput,
  Text,
  TextArea,
  TextInput,
  Tooltip,
} from "../../../base";
import {
  CharacterPortraitDrawer,
  ConfirmModal,
  EditTagsModal,
  TwoPaneDiff,
  type EditTagsAiContextOption,
} from "../../../common";
import { BrainstormSettingsModal } from "./BrainstormSettingsModal";
import {
  CharacterBrainstormPanel,
  type BrainstormApplyableField,
  type BrainstormChatMessage,
} from "./CharacterBrainstormPanel";

export type CharacterForm = {
  name: string;
  title: string;
  creator: string;
  cardVersion: string;
  creatorNotes: string;
  tags: string[];
  content: string;
};

export function blankCharacterForm(): CharacterForm {
  return {
    name: "",
    title: "",
    creator: "",
    cardVersion: "",
    creatorNotes: "",
    tags: [],
    content: "",
  };
}

export function templateToCharacterForm(t: CharacterTemplate): CharacterForm {
  const distinctTitle =
    t.title && t.title.trim().toLowerCase() !== t.name.trim().toLowerCase()
      ? t.title.trim()
      : "";
  return {
    name: t.name,
    title: distinctTitle,
    creator: t.creator ?? "",
    cardVersion: t.cardVersion ?? "",
    creatorNotes: t.creatorNotes ?? "",
    tags: t.tags ?? [],
    content: t.content,
  };
}

export function characterFormToUpdate(
  form: CharacterForm,
): CharacterTemplateUpdate {
  const trimmedTitle = form.title.trim();
  const trimmedName = form.name.trim();
  return {
    name: form.name,
    title:
      trimmedTitle && trimmedTitle.toLowerCase() !== trimmedName.toLowerCase()
        ? trimmedTitle
        : "",
    creator: form.creator.trim(),
    cardVersion: form.cardVersion.trim(),
    creatorNotes: form.creatorNotes,
    tags: form.tags,
    content: form.content,
  };
}

/** Side-by-side tag diff viewer for the "Both" tab with restore button, built on base primitives */
function TagDiffViewer({
  originalTags,
  currentTags,
  onRestore,
  taxonomyConfig,
}: {
  originalTags: string[];
  currentTags: string[];
  onRestore: () => void;
  taxonomyConfig?: TagTaxonomyConfig | null;
}) {
  const normOriginal = useMemo(
    () => originalTags.map((t) => t.toLowerCase()),
    [originalTags],
  );
  const normCurrent = useMemo(
    () => currentTags.map((t) => t.toLowerCase()),
    [currentTags],
  );

  const added = normCurrent.filter((t) => !normOriginal.includes(t));
  const removed = normOriginal.filter((t) => !normCurrent.includes(t));

  return (
    <Stack direction="column" gap="xs" fullWidth>
      <Stack
        direction="row"
        justify="between"
        align="center"
        gap="sm"
        fullWidth
      >
        <Text as="span" size="xs" weight="semibold" tone="secondary">
          Tags Comparison
        </Text>
        {originalTags.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            leftIcon="RotateCcw"
            onClick={onRestore}
            title="Restore original CCv2 tags"
          >
            Restore Original Tags
          </Button>
        ) : null}
      </Stack>

      <FormGrid cols={2} gap="sm">
        <Card variant="panel" padding="sm">
          <Stack direction="column" gap="xs">
            <Text as="span" size="xs" weight="semibold" tone="secondary">
              Original CCv2 Tags ({originalTags.length})
            </Text>
            <Stack direction="row" gap="2xs" wrap align="center">
              {originalTags.length === 0 ? (
                <Text as="span" size="xs" tone="muted" italic>
                  (no original tags)
                </Text>
              ) : (
                originalTags.map((tag) => {
                  const isRemoved = removed.includes(tag.toLowerCase());
                  return (
                    <span
                      key={tag}
                      style={
                        isRemoved
                          ? { opacity: 0.5, textDecoration: "line-through" }
                          : undefined
                      }
                    >
                      <TagChip tag={tag} userConfig={taxonomyConfig} size="sm" />
                    </span>
                  );
                })
              )}
            </Stack>
          </Stack>
        </Card>

        <Card variant="panel" padding="sm">
          <Stack direction="column" gap="xs">
            <Text as="span" size="xs" weight="semibold" tone="secondary">
              BL Format Tags ({currentTags.length})
            </Text>
            <Stack direction="row" gap="2xs" wrap align="center">
              {currentTags.length === 0 ? (
                <Text as="span" size="xs" tone="muted" italic>
                  (none)
                </Text>
              ) : (
                currentTags.map((tag) => {
                  const isAdded = added.includes(tag.toLowerCase());
                  return (
                    <span
                      key={tag}
                      style={
                        isAdded
                          ? {
                              filter:
                                "drop-shadow(0 0 4px rgba(74, 222, 128, 0.35))",
                            }
                          : undefined
                      }
                    >
                      <TagChip tag={tag} userConfig={taxonomyConfig} size="sm" />
                    </span>
                  );
                })
              )}
            </Stack>
          </Stack>
        </Card>
      </FormGrid>
    </Stack>
  );
}

export type CharacterEditorProps = {
  /** Existing character template to edit, or `null` when creating a new character. */
  template: CharacterTemplate | null;
  /** Optional initial status banner message (e.g. after duplicating a card as a variant). */
  initialStatus?: string | null;
  allLibraryTags: string[];
  taxonomyConfig: TagTaxonomyConfig | null;
  presetOptions: Preset[];
  targetFormatId: string | null;
  onTargetFormatChange: (formatId: string) => void;
  targetFormat: CharacterFormat;
  convertLoading: boolean;
  onRequestConvert: (template: CharacterTemplate) => void;
  onRequestReformat: (currentContent: string) => void;
  onRequestDelete: (id: string, name: string) => void;
  onTemplateUpdated: (updated: CharacterTemplate) => void;
  onSaved: (savedId: string) => Promise<void>;
  onClose: () => void;
};

export function CharacterEditor({
  template,
  initialStatus = null,
  allLibraryTags,
  taxonomyConfig,
  presetOptions,
  targetFormatId,
  onTargetFormatChange,
  targetFormat,
  convertLoading,
  onRequestConvert,
  onRequestReformat,
  onRequestDelete,
  onTemplateUpdated,
  onSaved,
  onClose,
}: CharacterEditorProps) {
  const editingId = template?.id ?? null;
  const editingIsCcv2 = template?.format === "ccv2";

  const [form, setForm] = useState<CharacterForm>(() =>
    template ? templateToCharacterForm(template) : blankCharacterForm(),
  );
  const [initialForm, setInitialForm] = useState<CharacterForm>(() =>
    template ? templateToCharacterForm(template) : blankCharacterForm(),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [viewTab, setViewTab] = useState<"bl" | "original" | "both">("bl");
  const [discardConfirm, setDiscardConfirm] = useState<boolean>(false);

  // Sync form when switching to a different character or when an external conversion/reformat updates the template
  const lastSyncedSignatureRef = useRef<string>(
    template
      ? `${template.id}:${template.version}:${template.format}:${template.content}:${template.creator ?? ""}:${template.cardVersion ?? ""}`
      : "new",
  );
  useEffect(() => {
    const nextSig = template
      ? `${template.id}:${template.version}:${template.format}:${template.content}:${template.creator ?? ""}:${template.cardVersion ?? ""}`
      : "new";
    if (lastSyncedSignatureRef.current === nextSig) return;
    const prevId = lastSyncedSignatureRef.current.split(":")[0];
    lastSyncedSignatureRef.current = nextSig;

    if (template) {
      const next = templateToCharacterForm(template);
      setForm(next);
      setInitialForm(next);
      setViewTab("bl");
      if (prevId !== template.id) {
        setStatus(initialStatus);
      }
    } else {
      const blank = blankCharacterForm();
      setForm(blank);
      setInitialForm(blank);
      setViewTab("bl");
      setStatus(null);
    }
  }, [template, initialStatus]);

  // ── AI Brainstorming State ──
  const [aiBrainstormOpen, setAiBrainstormOpen] = useState(false);
  const brainstormPaneRef = useRef<HTMLElement | null>(null);
  const prevAiBrainstormOpenRef = useRef(aiBrainstormOpen);

  useEffect(() => {
    const wasOpen = prevAiBrainstormOpenRef.current;
    prevAiBrainstormOpenRef.current = aiBrainstormOpen;
    if (!wasOpen && aiBrainstormOpen && typeof window !== "undefined") {
      const isMobileStacked =
        window.matchMedia?.("(max-width: 820px)").matches ||
        window.innerWidth <= 820;
      if (isMobileStacked) {
        requestAnimationFrame(() => {
          brainstormPaneRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    }
  }, [aiBrainstormOpen]);
  const [aiMessages, setAiMessages] = useState<BrainstormChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [includeOriginalCcv2, setIncludeOriginalCcv2] = useState(false);
  const [brainstormProviderId, setBrainstormProviderId] = useState<
    string | null
  >(null);
  const [brainstormAllowNewSections, setBrainstormAllowNewSections] =
    useState(true);
  const [brainstormSettingsOpen, setBrainstormSettingsOpen] = useState(false);
  const [brainstormSettingsError, setBrainstormSettingsError] = useState<
    string | null
  >(null);
  const [revertRetryTarget, setRevertRetryTarget] = useState<{
    id: string;
    drops: number;
  } | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);

  // ── Edit Tags Modal State ──
  const [editTagsModalOpen, setEditTagsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBrainstormSettings()
      .then((settings) => {
        if (cancelled) return;
        setIncludeOriginalCcv2(settings.includeOriginalCard);
        setBrainstormProviderId(settings.textProviderId);
        setBrainstormAllowNewSections(settings.allowNewSections);
      })
      .catch(() => {
        /* Defaults apply when settings cannot be read. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!editingId) {
      setAiMessages([]);
      return;
    }
    let cancelled = false;
    const key = brainstormStorageKey(editingId);
    const legacy = (
      decodeLegacyBrainstormSession(window.localStorage.getItem(key)) ?? []
    ).filter(isBrainstormMessage) as BrainstormChatMessage[];
    void (async () => {
      const fromServer = await getBrainstormSession(editingId);
      if (cancelled) return;
      if (fromServer && fromServer.messages.length > 0) {
        setAiMessages(fromServer.messages as BrainstormChatMessage[]);
      } else if (legacy.length > 0) {
        setAiMessages(legacy);
        persistBrainstormSession(legacy, editingId);
      } else {
        setAiMessages([]);
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* Ignore storage errors. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  useEffect(() => {
    return () => {
      aiAbortControllerRef.current?.abort();
    };
  }, []);

  function persistBrainstormSession(
    messages: BrainstormChatMessage[],
    id = editingId,
  ) {
    if (!id) return;
    void saveBrainstormSession(id, trimBrainstormMessages(messages)).catch(
      () => {},
    );
  }

  const isFormDirty = useMemo(() => {
    if (form.name !== initialForm.name) return true;
    if (form.title !== initialForm.title) return true;
    if (form.creator !== initialForm.creator) return true;
    if (form.cardVersion !== initialForm.cardVersion) return true;
    if (form.creatorNotes !== initialForm.creatorNotes) return true;
    if (form.content !== initialForm.content) return true;
    if (form.tags.length !== initialForm.tags.length) return true;
    for (let i = 0; i < form.tags.length; i++) {
      if (form.tags[i] !== initialForm.tags[i]) return true;
    }
    return false;
  }, [form, initialForm]);

  const hasUnsavedWork = isFormDirty || (!editingId && aiMessages.length > 0);

  function handleCancelBrainstorm() {
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }
    setAiLoading(false);
  }

  function handleCancelClick() {
    if (hasUnsavedWork) {
      setDiscardConfirm(true);
    } else {
      setEditTagsModalOpen(false);
      handleCancelBrainstorm();
      onClose();
    }
  }

  async function runBrainstormTurn(
    history: BrainstormChatMessage[],
    userMessage: BrainstormChatMessage,
  ) {
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    aiAbortControllerRef.current = controller;

    const nextHistory = [...history, userMessage];
    setAiMessages(nextHistory);
    persistBrainstormSession(nextHistory);
    setAiLoading(true);
    setAiError(null);

    try {
      const res = await brainstormCharacter(
        {
          character: {
            name: form.name,
            content: form.content,
            creatorNotes: form.creatorNotes,
            tags: form.tags,
            ccv2Content: template?.ccv2Content,
          },
          chatHistory: history.map((m) => ({
            role: m.role,
            content: brainstormHistoryContent(m),
          })),
          userMessage: userMessage.content,
          includeOriginalCard: includeOriginalCcv2,
          allowNewSections: brainstormAllowNewSections,
          ...(brainstormProviderId ? { providerId: brainstormProviderId } : {}),
          format: targetFormat,
        },
        { signal: controller.signal },
      );

      const assistantMsg: BrainstormChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.reply,
        proposedChanges: res.proposedChanges,
        unmappedHeaders: res.unmappedHeaders,
        newSections: res.newSections,
        model: res.model,
        appliedChanges: {},
      };

      const settled = [...nextHistory, assistantMsg];
      setAiMessages(settled);
      persistBrainstormSession(settled);
    } catch (e) {
      if (
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("abort") ||
            e.message.includes("cancelled"))) ||
        controller.signal.aborted
      ) {
        return;
      }
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      if (aiAbortControllerRef.current === controller) {
        setAiLoading(false);
        aiAbortControllerRef.current = null;
      }
    }
  }

  function handleSendBrainstormMessage(userText: string) {
    return runBrainstormTurn(aiMessages, {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
    });
  }

  function questionBefore(messageId: string) {
    const index = aiMessages.findIndex((m) => m.id === messageId);
    if (index <= 0) return null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = aiMessages[i];
      if (candidate?.role === "user") {
        return { history: aiMessages.slice(0, i), question: candidate };
      }
    }
    return null;
  }

  function performRevertRetry(messageId: string) {
    const found = questionBefore(messageId);
    if (!found) return;
    void runBrainstormTurn(found.history, found.question);
  }

  function handleRegenerateBrainstorm(messageId: string) {
    performRevertRetry(messageId);
  }

  function handleRevertAndRetryBrainstorm(messageId: string) {
    const index = aiMessages.findIndex((m) => m.id === messageId);
    const drops = index === -1 ? 0 : aiMessages.length - (index + 1);
    if (drops > 0) {
      setRevertRetryTarget({ id: messageId, drops });
      return;
    }
    performRevertRetry(messageId);
  }

  function handleEditBrainstormMessage(messageId: string, text: string) {
    const index = aiMessages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    const edited: BrainstormChatMessage = {
      ...aiMessages[index]!,
      content: text,
    };
    const kept = [...aiMessages.slice(0, index), edited];
    setAiMessages(kept);
    persistBrainstormSession(kept);
    if (index === aiMessages.length - 1) {
      void runBrainstormTurn(aiMessages.slice(0, index), edited);
    }
  }

  function handleToggleIncludeOriginalCard(include: boolean) {
    setIncludeOriginalCcv2(include);
    setBrainstormSettingsError(null);
    setBrainstormSettings({ includeOriginalCard: include }).catch(
      (error: unknown) => {
        setIncludeOriginalCcv2(!include);
        setBrainstormSettingsError(
          error instanceof Error
            ? error.message
            : "Could not save that preference",
        );
      },
    );
  }

  function handleToggleAllowNewSections(allow: boolean) {
    setBrainstormAllowNewSections(allow);
    setBrainstormSettingsError(null);
    setBrainstormSettings({ allowNewSections: allow }).catch(
      (error: unknown) => {
        setBrainstormAllowNewSections(!allow);
        setBrainstormSettingsError(
          error instanceof Error
            ? error.message
            : "Could not save that preference",
        );
      },
    );
  }

  function handleBrainstormProviderChange(id: string | null) {
    const previous = brainstormProviderId;
    setBrainstormProviderId(id);
    setBrainstormSettingsError(null);
    setBrainstormSettings({ textProviderId: id }).catch((error: unknown) => {
      setBrainstormProviderId(previous);
      setBrainstormSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save that connection",
      );
    });
  }

  const formatSectionOpts = useMemo(
    () => ({
      order: targetFormat.sections.map((s) => s.name),
      inlineHeaders: targetFormat.sections
        .filter((s) => s.inline)
        .map((s) => s.name),
    }),
    [targetFormat],
  );

  function handleApplySection(
    section: ProposedSectionChange,
    messageId: string,
  ) {
    const updatedContent = applySectionChanges(
      form.content,
      [section],
      formatSectionOpts,
    );
    setForm((f) => ({ ...f, content: updatedContent }));

    const next = aiMessages.map((msg) =>
      msg.id === messageId
        ? {
            ...msg,
            appliedChanges: {
              ...msg.appliedChanges,
              [`section:${section.header.toLowerCase()}`]: true,
            },
          }
        : msg,
    );
    setAiMessages(next);
    persistBrainstormSession(next);
  }

  function handleApplyBrainstormField(
    field: BrainstormApplyableField,
    proposed: NonNullable<CharacterBrainstormResult["proposedChanges"]>,
    messageId: string,
  ) {
    setForm((f) => {
      if (field === "name" && proposed.name) {
        return { ...f, name: proposed.name };
      }
      if (field === "creatorNotes" && proposed.creatorNotes !== undefined) {
        return { ...f, creatorNotes: proposed.creatorNotes };
      }
      if (field === "fullContent" && proposed.fullContent) {
        return { ...f, content: proposed.fullContent };
      }
      if (field === "tags" && proposed.tags && proposed.tags.length > 0) {
        const tagSet = new Set(f.tags.map((t) => t.toLowerCase()));
        const merged = [...f.tags];
        for (const t of proposed.tags) {
          if (!tagSet.has(t.toLowerCase())) {
            tagSet.add(t.toLowerCase());
            merged.push(t);
          }
        }
        return { ...f, tags: sortTags(merged, taxonomyConfig) };
      }
      return f;
    });

    const next = aiMessages.map((msg) =>
      msg.id === messageId
        ? {
            ...msg,
            appliedChanges: {
              ...msg.appliedChanges,
              [field]: true,
            },
          }
        : msg,
    );
    setAiMessages(next);
    persistBrainstormSession(next);
  }

  function handleApplyAllProposed(
    proposed: CharacterBrainstormResult["proposedChanges"],
    messageId: string,
  ) {
    if (!proposed) return;

    setForm((f) => {
      let content = f.content;
      if (proposed.fullContent) {
        content = proposed.fullContent;
      } else if (proposed.sections && proposed.sections.length > 0) {
        content = applySectionChanges(
          content,
          proposed.sections,
          formatSectionOpts,
        );
      }

      let tags = f.tags;
      if (proposed.tags && proposed.tags.length > 0) {
        const tagSet = new Set(f.tags.map((t) => t.toLowerCase()));
        const merged = [...f.tags];
        for (const t of proposed.tags) {
          if (!tagSet.has(t.toLowerCase())) {
            tagSet.add(t.toLowerCase());
            merged.push(t);
          }
        }
        tags = sortTags(merged, taxonomyConfig);
      }

      return {
        ...f,
        content,
        tags,
        ...(proposed.creatorNotes
          ? { creatorNotes: proposed.creatorNotes }
          : {}),
        ...(proposed.name ? { name: proposed.name } : {}),
      };
    });

    const next = aiMessages.map((msg) =>
      msg.id === messageId
        ? {
            ...msg,
            appliedChanges: {
              ...msg.appliedChanges,
              all: true,
              ...(proposed.name ? { name: true } : {}),
              ...(proposed.tags && proposed.tags.length > 0
                ? { tags: true }
                : {}),
              ...(proposed.creatorNotes ? { creatorNotes: true } : {}),
              ...(proposed.fullContent ? { fullContent: true } : {}),
              ...(proposed.sections
                ? Object.fromEntries(
                    proposed.sections.map((s) => [
                      `section:${s.header.toLowerCase()}`,
                      true,
                    ]),
                  )
                : {}),
            },
          }
        : msg,
    );
    setAiMessages(next);
    persistBrainstormSession(next);
  }

  function handleClearBrainstormChat() {
    setAiMessages([]);
    setAiError(null);
    if (!editingId) return;
    void clearBrainstormSession(editingId).catch(() => {});
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const canonicalTags = sortTags(form.tags, taxonomyConfig);
      const update = characterFormToUpdate({ ...form, tags: canonicalTags });
      const effectiveLabel = update.title || form.name.trim();
      let savedId: string;
      if (editingId) {
        await updateCharacter(
          editingId,
          editingIsCcv2
            ? {
                name: update.name,
                title: update.title,
                creator: update.creator,
                cardVersion: update.cardVersion,
              }
            : update,
        );
        savedId = editingId;
        setStatus(`"${effectiveLabel}" saved successfully.`);
      } else {
        const created = await createCharacter(form.name, update.title);
        await updateCharacter(created.id, {
          title: update.title,
          creator: update.creator,
          cardVersion: update.cardVersion,
          content: form.content,
          creatorNotes: form.creatorNotes,
          tags: canonicalTags,
        });
        savedId = created.id;
        persistBrainstormSession(aiMessages, created.id);
        setStatus(`"${effectiveLabel}" created and saved successfully.`);
      }
      const nextForm = {
        ...form,
        title: update.title ?? "",
        creator: update.creator ?? "",
        cardVersion: update.cardVersion ?? "",
        tags: canonicalTags,
      };
      setForm(nextForm);
      setInitialForm(nextForm);
      await onSaved(savedId);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const hasOriginalCcv2 = template?.cardRef?.kind === "png";
  const updatedAt = template?.avatarUpdatedAt;
  const isConverted =
    editingId !== null && Boolean(template?.ccv2Content) && !editingIsCcv2;
  const originalCreatorNotes =
    template?.ccv2CreatorNotes ?? template?.creatorNotes ?? "";
  const originalTags =
    template?.ccv2Tags ??
    (template?.format === "ccv2" ? (template.tags ?? []) : []) ??
    [];

  const isStatusError = Boolean(
    status &&
      (status.toLowerCase().includes("error") ||
        status.toLowerCase().includes("fail")),
  );

  const aiTagsButton = !editingIsCcv2 ? (
    <Button
      type="button"
      variant="ai"
      size="xs"
      onClick={() => setEditTagsModalOpen(true)}
      leftIcon={<Icon name="Sparkles" size={13} />}
      title="Open Edit Tags & AI Tag Suggestions modal"
    >
      Edit Tags by AI
    </Button>
  ) : undefined;

  return (
    <Card variant="elevated" padding="lg" fullWidth>
      <Stack direction="column" align="stretch" gap="md" fullWidth>
        <Header
          variant="panel"
          leading={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon="ArrowLeft"
              onClick={handleCancelClick}
              disabled={saving}
              title="Return to Character Library"
            >
              Back to List
            </Button>
          }
          title={
            editingId
              ? `Edit: ${form.title.trim() || form.name || "Untitled"}`
              : "New Character"
          }
          badge={
            status ? (
              <Badge
                variant={isStatusError ? "danger" : "success"}
                size="xs"
                pill
                leftIcon={isStatusError ? "AlertCircle" : "Check"}
              >
                {status}
              </Badge>
            ) : undefined
          }
          actions={
            <Stack direction="row" align="center" gap="sm" wrap>
              <Stack direction="row" align="center" gap="xs" wrap>
                {presetOptions.length > 0 ? (
                  <SimpleSelect<string>
                    size="sm"
                    value={targetFormatId ?? (presetOptions[0]?.id || "")}
                    onChange={onTargetFormatChange}
                    aria-label="Target Character Format"
                    options={presetOptions.map((p) => ({
                      value: p.id,
                      label: `Format: ${p.name}`,
                    }))}
                  />
                ) : null}

                {!editingIsCcv2 &&
                editingId &&
                !isFormatAligned(form.content, targetFormat) ? (
                  <Button
                    type="button"
                    variant="ai"
                    size="sm"
                    onClick={() => onRequestReformat(form.content)}
                    disabled={convertLoading}
                    title="Restructure this sheet to match the selected format, with a preview before applying"
                    leftIcon={
                      <Icon
                        name="Sparkles"
                        size={14}
                        pulse={convertLoading}
                      />
                    }
                  >
                    {convertLoading
                      ? "Updating…"
                      : "Update into Newer Format with AI"}
                  </Button>
                ) : null}

                {editingIsCcv2 && template ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    leftIcon="Sparkles"
                    onClick={() => onRequestConvert(template)}
                    disabled={convertLoading}
                  >
                    {convertLoading ? "Converting…" : "Convert to BL Format"}
                  </Button>
                ) : null}
              </Stack>

              <Stack direction="row" align="center" gap="xs" wrap>
                {!editingIsCcv2 ? (
                  <Button
                    type="button"
                    variant="ai"
                    size="sm"
                    onClick={() => setAiBrainstormOpen((v) => !v)}
                    leftIcon={
                      <Icon
                        name="Sparkles"
                        size={14}
                        pulse={aiLoading}
                      />
                    }
                    title={
                      aiBrainstormOpen
                        ? "Hide AI Assistant"
                        : "Open AI Brainstorm Assistant"
                    }
                  >
                    <span>AI Assistant</span>
                    {aiMessages.length > 0 ? (
                      <Badge variant="neutral" size="xs" pill>
                        {aiMessages.length}
                      </Badge>
                    ) : null}
                  </Button>
                ) : null}

                <Tooltip
                  content={
                    !isFormDirty ? "No changes to save" : "Save character card"
                  }
                >
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    leftIcon="Check"
                    onClick={() => void handleSave()}
                    disabled={saving || !form.name.trim() || !isFormDirty}
                    isLoading={saving}
                  >
                    Save
                  </Button>
                </Tooltip>
              </Stack>
            </Stack>
          }
        />

        <Separator />

        <Stack
          direction="row"
          align="start"
          gap="lg"
          fullWidth
          stackBelow="md"
        >
          <Stack
            direction="column"
            align="stretch"
            gap="md"
            flex1
            fullWidth
          >
            <CharacterPortraitDrawer
              entityId={template?.id}
              entityName={form.name}
              entityLabel="character card"
              portraitUrl={
                template
                  ? getCharacterAvatarUrl(template.id, "portrait", updatedAt)
                  : null
              }
              profileUrl={
                template
                  ? getCharacterAvatarUrl(template.id, "profile", updatedAt)
                  : null
              }
              originalUrl={
                template && hasOriginalCcv2
                  ? getCharacterAvatarUrl(template.id, "original", updatedAt)
                  : null
              }
              hasOriginalCcv2={hasOriginalCcv2}
              hasCustomPortrait={Boolean(template?.customPortrait)}
              hasProfileImage={Boolean(template?.profileImage)}
              onUploadPortrait={async (dataBase64, fileName) => {
                if (!editingId) return;
                const res = await uploadCharacterAvatar(
                  editingId,
                  "portrait",
                  dataBase64,
                  fileName,
                );
                onTemplateUpdated(res.record);
              }}
              onUploadProfile={async (dataBase64, fileName) => {
                if (!editingId) return;
                const res = await uploadCharacterAvatar(
                  editingId,
                  "profile",
                  dataBase64,
                  fileName,
                );
                onTemplateUpdated(res.record);
              }}
              onRestoreOriginalPortrait={async () => {
                if (!editingId) return;
                const res = await restoreOriginalCharacterAvatar(editingId);
                onTemplateUpdated(res.record);
              }}
              onDeletePortrait={async () => {
                if (!editingId) return;
                const res = await restoreOriginalCharacterAvatar(editingId);
                onTemplateUpdated(res.record);
              }}
              onDeleteProfile={async () => {
                if (!editingId) return;
                const res = await deleteCharacterProfileAvatar(editingId);
                onTemplateUpdated(res.record);
              }}
              disabled={saving}
            />

            <FormGrid cols={2} gap="sm">
              <TextInput
                label="Character Name (In-Story / AI)"
                value={form.name}
                placeholder="e.g. Miku"
                helperText="The name used inside stories and seen by the AI."
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <TextInput
                label="Card Title / Variant (Optional)"
                value={form.title}
                placeholder={
                  form.name.trim()
                    ? `e.g. ${form.name.trim()} — Anthro Fox`
                    : "e.g. Miku — Anthro Fox"
                }
                helperText="Displayed in the library only (hidden from the AI). Defaults to Character Name if blank."
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                rightElement={
                  !form.title.trim() && form.name.trim() ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setForm((f) => ({ ...f, title: f.name.trim() }))
                      }
                      title="Copy current Character Name into Card Title so you can shorten the in-story Character Name"
                    >
                      Copy Name
                    </Button>
                  ) : undefined
                }
              />
            </FormGrid>

            <FormGrid cols={2} gap="sm">
              <TextInput
                label="Creator / Author (Optional)"
                value={form.creator}
                placeholder="e.g. @author or Anonymous"
                helperText="Credit for the original card author or creator."
                onChange={(e) =>
                  setForm((f) => ({ ...f, creator: e.target.value }))
                }
              />
              <TextInput
                label="Card Version (Optional)"
                value={form.cardVersion}
                placeholder="e.g. 1.0"
                helperText="Displayed on the card badge in the library when set (hidden if blank)."
                onChange={(e) =>
                  setForm((f) => ({ ...f, cardVersion: e.target.value }))
                }
              />
            </FormGrid>

            {!isConverted ? (
              <Stack direction="column" align="stretch" gap="md" fullWidth>
                <TextArea
                  label={
                    <Stack direction="row" align="center" gap="xs">
                      <span>Creator&apos;s Notes</span>
                      {editingIsCcv2 ? (
                        <Badge variant="outline" size="xs" pill>
                          Read-only CCv2 sheet
                        </Badge>
                      ) : null}
                    </Stack>
                  }
                  rows={3}
                  autoGrow
                  value={form.creatorNotes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      creatorNotes: e.target.value,
                    }))
                  }
                  placeholder="Optional notes from the creator (e.g. usage guidelines, character background, tags)..."
                  disabled={editingIsCcv2}
                />

                <TagInput
                  label="Tags"
                  headerAction={aiTagsButton}
                  value={form.tags}
                  onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                  suggestions={allLibraryTags}
                  sortOnChange
                  chipSize="md"
                  disabled={editingIsCcv2}
                  userConfig={taxonomyConfig}
                  placeholder="Add tags (e.g. species:elf, rating:sfw)…"
                />

                <TextArea
                  label={
                    <Stack direction="row" align="center" gap="xs">
                      <span>Content (full character sheet)</span>
                      {editingIsCcv2 ? (
                        <Badge variant="outline" size="xs" pill>
                          Read-only CCv2 sheet
                        </Badge>
                      ) : null}
                    </Stack>
                  }
                  rows={16}
                  autoGrow
                  value={form.content}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      content: e.target.value,
                    }))
                  }
                  placeholder={CHARACTER_SHEET_EXAMPLE}
                  disabled={editingIsCcv2}
                />
              </Stack>
            ) : (
              <Stack direction="column" align="stretch" gap="md" fullWidth>
                <Tabs<"bl" | "original" | "both">
                  variant="underline"
                  activeTab={viewTab}
                  onChange={setViewTab}
                  tabs={[
                    { id: "bl", label: "BL Format" },
                    { id: "original", label: "Original" },
                    { id: "both", label: "Both" },
                  ]}
                />

                {viewTab === "bl" ? (
                  <Stack direction="column" align="stretch" gap="md" fullWidth>
                    <TextArea
                      label="Creator's Notes (BL format — editable)"
                      rows={3}
                      autoGrow
                      value={form.creatorNotes}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          creatorNotes: e.target.value,
                        }))
                      }
                      placeholder="Optional notes from the creator (e.g. usage guidelines, character background, tags)..."
                    />

                    <TagInput
                      label="Tags"
                      headerAction={aiTagsButton}
                      value={form.tags}
                      onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                      suggestions={allLibraryTags}
                      sortOnChange
                      chipSize="md"
                      userConfig={taxonomyConfig}
                      placeholder="Add tags (e.g. species:elf, rating:sfw)…"
                    />

                    <TextArea
                      label="Content (BL format — editable)"
                      rows={16}
                      autoGrow
                      value={form.content}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          content: e.target.value,
                        }))
                      }
                    />
                  </Stack>
                ) : viewTab === "original" ? (
                  <Stack direction="column" align="stretch" gap="md" fullWidth>
                    <TextArea
                      label={
                        <Stack direction="row" align="center" gap="xs">
                          <span>Original Creator&apos;s Notes</span>
                          <Badge variant="outline" size="xs" pill>
                            Read-only
                          </Badge>
                        </Stack>
                      }
                      rows={3}
                      autoGrow
                      value={originalCreatorNotes}
                      readOnly
                      placeholder="(no original creator notes)"
                    />

                    <Stack direction="column" gap="xs" fullWidth>
                      <Stack
                        direction="row"
                        justify="between"
                        align="center"
                        gap="sm"
                        fullWidth
                      >
                        <Text
                          as="span"
                          size="xs"
                          weight="semibold"
                          tone="secondary"
                        >
                          Original CCv2 Tags
                        </Text>
                        {originalTags.length > 0 ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            leftIcon="RotateCcw"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                tags: [...originalTags],
                              }))
                            }
                            title="Restore original CCv2 tags to current character sheet"
                          >
                            Restore Original Tags
                          </Button>
                        ) : null}
                      </Stack>
                      <Card variant="panel" padding="sm">
                        <Stack direction="row" gap="xs" wrap align="center">
                          {originalTags.length > 0 ? (
                            originalTags.map((tag) => (
                              <TagChip
                                key={tag}
                                tag={tag}
                                userConfig={taxonomyConfig}
                                size="sm"
                              />
                            ))
                          ) : (
                            <Text as="span" size="xs" tone="muted" italic>
                              (no original tags)
                            </Text>
                          )}
                        </Stack>
                      </Card>
                    </Stack>

                    <TextArea
                      label={
                        <Stack direction="row" align="center" gap="xs">
                          <span>Original CCv2 Content</span>
                          <Badge variant="outline" size="xs" pill>
                            Read-only
                          </Badge>
                        </Stack>
                      }
                      rows={16}
                      autoGrow
                      value={template?.ccv2Content ?? ""}
                      readOnly
                    />
                  </Stack>
                ) : (
                  <Stack direction="column" align="stretch" gap="md" fullWidth>
                    <Stack direction="column" gap="xs" fullWidth>
                      <Text
                        as="span"
                        size="xs"
                        weight="semibold"
                        tone="secondary"
                      >
                        Creator&apos;s Notes
                      </Text>
                      <TwoPaneDiff
                        leftLabel="Original Creator's Notes"
                        rightLabel="BL Format"
                        leftContent={originalCreatorNotes}
                        rightContent={form.creatorNotes}
                        size="sm"
                      />
                    </Stack>

                    <TagDiffViewer
                      originalTags={originalTags}
                      currentTags={form.tags}
                      onRestore={() =>
                        setForm((f) => ({
                          ...f,
                          tags: [...originalTags],
                        }))
                      }
                      taxonomyConfig={taxonomyConfig}
                    />

                    <Stack direction="column" gap="xs" fullWidth>
                      <Text
                        as="span"
                        size="xs"
                        weight="semibold"
                        tone="secondary"
                      >
                        Content
                      </Text>
                      <TwoPaneDiff
                        leftLabel="Original CCv2"
                        rightLabel="BL Format"
                        leftContent={template?.ccv2Content ?? ""}
                        rightContent={form.content}
                        size="md"
                      />
                    </Stack>
                  </Stack>
                )}
              </Stack>
            )}

            <Separator />

            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="sm"
              wrap
              fullWidth
            >
              {editingId ? (
                <Tooltip content="Delete this character card from the library">
                  <Button
                    type="button"
                    variant="danger"
                    leftIcon="Trash2"
                    onClick={() => {
                      const targetName = template
                        ? displayTitle(template)
                        : form.name;
                      onRequestDelete(editingId, targetName);
                    }}
                    disabled={saving}
                  >
                    Delete
                  </Button>
                </Tooltip>
              ) : (
                <span />
              )}

              <Stack direction="row" align="center" gap="sm">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelClick}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Tooltip
                  content={
                    !isFormDirty ? "No changes to save" : "Save character card"
                  }
                >
                  <Button
                    type="button"
                    variant="primary"
                    leftIcon="Check"
                    onClick={() => void handleSave()}
                    disabled={saving || !form.name.trim() || !isFormDirty}
                    isLoading={saving}
                  >
                    Save
                  </Button>
                </Tooltip>
              </Stack>
            </Stack>
          </Stack>

          {aiBrainstormOpen ? (
            <Stack
              ref={brainstormPaneRef}
              direction="column"
              flex1
              fullWidth
              style={{
                position: "sticky",
                top: "1rem",
                height: "calc(100vh - 120px)",
                maxHeight: "calc(100vh - 120px)",
              }}
            >
              <CharacterBrainstormPanel
                characterName={form.name}
                hasOriginalCcv2={Boolean(template?.ccv2Content)}
                includeOriginalCcv2={includeOriginalCcv2}
                taxonomyConfig={taxonomyConfig}
                onOpenSettings={() => setBrainstormSettingsOpen(true)}
                messages={aiMessages}
                onSendMessage={handleSendBrainstormMessage}
                onEditMessage={handleEditBrainstormMessage}
                onRevertAndRetry={handleRevertAndRetryBrainstorm}
                onRegenerate={handleRegenerateBrainstorm}
                onApplySection={handleApplySection}
                onApplyField={handleApplyBrainstormField}
                onApplyAll={handleApplyAllProposed}
                onClearChat={handleClearBrainstormChat}
                onClose={() => setAiBrainstormOpen(false)}
                loading={aiLoading}
                error={aiError}
                onCancel={handleCancelBrainstorm}
              />
            </Stack>
          ) : null}
        </Stack>
      </Stack>

      {/* Edit Tags & AI Tag Suggestion Modal */}
      {editTagsModalOpen
        ? (() => {
            const hasOriginalSheetOrScenario = Boolean(
              (template?.ccv2Content?.trim() &&
                template.ccv2Content.trim() !== form.content.trim()) ||
                template?.scenario?.trim(),
            );
            const contextOptions: EditTagsAiContextOption[] = [
              {
                id: "content",
                icon: "FileText",
                title: "Character Sheet / Description",
                description:
                  "Personality, appearance, background, and traits from the character sheet.",
                defaultChecked: true,
              },
              {
                id: "creatorNotes",
                icon: "MessageSquare",
                title: "Creator's Notes / Comment",
                description:
                  "Author commentary, backstory notes, and usage context.",
                defaultChecked: Boolean(
                  form.creatorNotes.trim() || template?.ccv2CreatorNotes?.trim(),
                ),
              },
              ...(hasOriginalSheetOrScenario
                ? [
                    {
                      id: "originalCard",
                      icon: "BookOpen" as const,
                      title: "Original CCv2 Sheet & Scenario",
                      description:
                        "Include the raw imported CCv2 description and scenario text.",
                      defaultChecked: true,
                    },
                  ]
                : []),
              ...(originalTags.length > 0
                ? [
                    {
                      id: "originalTags",
                      icon: "Tag" as const,
                      title: "Original CCv2 Tags",
                      description:
                        "Include the card's original imported CCv2 tags on the Edit Tags with AI prompt.",
                      defaultChecked: true,
                    },
                  ]
                : []),
            ];

            return (
              <EditTagsModal
                entityName={
                  form.title.trim() || form.name.trim() || "New Character"
                }
                taxonomy="character"
                userConfig={taxonomyConfig}
                initialTags={form.tags}
                originalTags={
                  originalTags.length > 0 ? originalTags : undefined
                }
                restoreOriginalLabel="Restore CCv2 Tags"
                libraryTags={allLibraryTags}
                busy={false}
                error={null}
                contextOptions={contextOptions}
                onSuggestAiTags={async ({
                  providerId,
                  currentTags,
                  guidance,
                  selectedContext,
                  signal,
                }) => {
                  const contentParts: string[] = [];
                  if (selectedContext.content ?? true) {
                    if (form.content.trim()) {
                      contentParts.push(form.content.trim());
                    }
                  }
                  if (selectedContext.originalCard) {
                    if (
                      template?.ccv2Content?.trim() &&
                      template.ccv2Content.trim() !== form.content.trim()
                    ) {
                      contentParts.push(
                        `[Original CCv2 Description]\n${template.ccv2Content.trim()}`,
                      );
                    }
                    if (template?.scenario?.trim()) {
                      contentParts.push(
                        `[Scenario]\n${template.scenario.trim()}`,
                      );
                    }
                  }
                  const effectiveContent =
                    contentParts.length > 0
                      ? contentParts.join("\n\n")
                      : form.content;

                  const effectiveCreatorNotes = selectedContext.creatorNotes
                    ? [
                        form.creatorNotes.trim(),
                        template?.ccv2CreatorNotes?.trim() &&
                        template.ccv2CreatorNotes.trim() !==
                          form.creatorNotes.trim()
                          ? `[Original CCv2 Creator Notes]\n${template.ccv2CreatorNotes.trim()}`
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join("\n\n") || undefined
                    : undefined;

                  const guidanceParts: string[] = [];
                  if (guidance?.trim()) {
                    guidanceParts.push(guidance.trim());
                  }
                  if (
                    selectedContext.originalTags &&
                    originalTags.length > 0
                  ) {
                    guidanceParts.push(
                      `Original imported CCv2 tags on this card: ${originalTags.join(", ")}. Evaluate which of these original tags (or standardized BobbinLoom equivalents) remain accurate and worth keeping.`,
                    );
                  }

                  const res = await suggestCharacterTags(
                    {
                      providerId,
                      name: form.title.trim() || form.name.trim() || "Character",
                      content: effectiveContent,
                      creatorNotes: effectiveCreatorNotes,
                      currentTags,
                      guidance:
                        guidanceParts.length > 0
                          ? guidanceParts.join("\n\n")
                          : undefined,
                      libraryTags: allLibraryTags,
                    },
                    { signal },
                  );
                  return res.tags;
                }}
                onSave={(nextTags) => {
                  setForm((f) => ({
                    ...f,
                    tags: sortTags(nextTags, taxonomyConfig),
                  }));
                  setEditTagsModalOpen(false);
                }}
                onClose={() => setEditTagsModalOpen(false)}
              />
            );
          })()
        : null}

      {/* Brainstorm Settings Modal */}
      {brainstormSettingsOpen ? (
        <BrainstormSettingsModal
          hasOriginalCcv2={Boolean(template?.ccv2Content)}
          includeOriginalCard={includeOriginalCcv2}
          allowNewSections={brainstormAllowNewSections}
          providerId={brainstormProviderId}
          errorMessage={brainstormSettingsError}
          onToggleIncludeOriginalCard={handleToggleIncludeOriginalCard}
          onToggleAllowNewSections={handleToggleAllowNewSections}
          onProviderChange={handleBrainstormProviderChange}
          onClose={() => {
            setBrainstormSettingsOpen(false);
            setBrainstormSettingsError(null);
          }}
        />
      ) : null}

      {/* Revert & Retry Confirmation Modal */}
      {revertRetryTarget ? (
        <ConfirmModal
          title="Revert & Retry"
          message={`Go back to the question this answered and ask it again? The ${revertRetryTarget.drops} message${revertRetryTarget.drops === 1 ? "" : "s"} after it will be dropped.`}
          confirmLabel="Revert & Retry"
          onConfirm={() => {
            const target = revertRetryTarget;
            setRevertRetryTarget(null);
            if (target) performRevertRetry(target.id);
          }}
          onCancel={() => setRevertRetryTarget(null)}
        />
      ) : null}

      {/* Discard Unsaved Changes Confirmation Modal */}
      {discardConfirm ? (
        <ConfirmModal
          title="Discard unsaved changes?"
          confirmLabel="Discard Changes"
          cancelLabel="Keep Editing"
          danger
          onConfirm={() => {
            setDiscardConfirm(false);
            setEditTagsModalOpen(false);
            handleCancelBrainstorm();
            onClose();
          }}
          onCancel={() => setDiscardConfirm(false)}
          message={
            !editingId && aiMessages.length > 0 ? (
              <span>
                <strong>&quot;{form.name || "New Character"}&quot;</strong> has
                not been saved yet, so its AI brainstorming session (
                {aiMessages.length} message
                {aiMessages.length === 1 ? "" : "s"}) cannot be kept
                {isFormDirty ? ", and your edits to the sheet go with it" : ""}.
              </span>
            ) : (
              <span>
                You have unsaved changes to{" "}
                <strong>&quot;{form.name || "New Character"}&quot;</strong>
                {aiMessages.length > 0
                  ? `, and an AI brainstorming session (${aiMessages.length} message${aiMessages.length === 1 ? "" : "s"}) which is kept`
                  : ""}
                . Your unsaved edits will be discarded.
              </span>
            )
          }
        />
      ) : null}
    </Card>
  );
}
