import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  CharacterInstance,
  CharacterPortrait,
  CharacterTemplate,
  ImageApiStyle,
  Playthrough,
} from "../../../../../schemas";
import {
  buildImageUrl,
  deleteCharacterPortrait,
  generateCharacterPortrait,
  getPromptConfig,
  listProviderConnections,
  previewCharacterPortraitPrompt,
  setOrUploadCharacterPortrait,
  type ImagePromptPreview,
} from "../../../../api";
import {
  Badge,
  Button,
  Card,
  CharacterAvatar,
  CheckboxRow,
  FormGrid,
  Header,
  Icon,
  Modal,
  Separator,
  Stack,
  StatusMessage,
  Text,
  TextInput,
} from "../../../base";
import { ConfirmModal, ImageViewer } from "../../../common";
import { ImagePromptModal } from "../ImagePromptModal";

export type CharacterPortraitModalProps = {
  character: CharacterInstance;
  localTemplate?: CharacterTemplate;
  playthrough: Playthrough;
  imagePromptPreview?: boolean;
  onPlaythroughChange: (updated: Playthrough) => void;
  onClose: () => void;
};

function formatPortraitDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CharacterPortraitModal({
  character,
  localTemplate,
  playthrough,
  imagePromptPreview = true,
  onPlaythroughChange,
  onClose,
}: CharacterPortraitModalProps) {
  const titleId = useId();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Always read the latest character state from playthrough in case an action updated it
  const liveCharacter =
    playthrough.characters.find((c) => c.id === character.id) ?? character;
  const portraits = useMemo(
    () =>
      [...(liveCharacter.avatars ?? [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [liveCharacter.avatars],
  );

  const [note, setNote] = useState("");
  const [includeStoryContext, setIncludeStoryContext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectingFile, setSelectingFile] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prompt review modal state (when imagePromptPreview is enabled)
  const [promptPreview, setPromptPreview] = useState<ImagePromptPreview | null>(
    null,
  );
  const [rerunningPrompt, setRerunningPrompt] = useState(false);

  // Active image provider metadata for the review modal
  const [imageConnection, setImageConnection] = useState<{
    label: string;
    model: string;
    apiStyle?: ImageApiStyle;
  } | null>(null);
  const [characterLimit, setCharacterLimit] = useState<number | undefined>(
    undefined,
  );

  // Full-screen viewer & delete confirmation state
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] =
    useState<CharacterPortrait | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listProviderConnections()
      .then((reg) => {
        if (cancelled) return;
        const imageConns = reg.connections.filter((c) => c.kind === "image");
        const active =
          imageConns.find((c) => c.id === reg.activeImageProviderId) ??
          imageConns[0] ??
          null;
        setImageConnection(
          active
            ? {
                label: active.label,
                model: active.model,
                apiStyle: active.apiStyle,
              }
            : null,
        );
      })
      .catch(() => {});

    void getPromptConfig()
      .then((state) => {
        if (cancelled) return;
        setCharacterLimit(
          state.promptConfig.imageGeneration?.promptCharacterLimit,
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  const viewingIndex = useMemo(
    () =>
      viewingFile
        ? portraits.findIndex((item) => item.file === viewingFile)
        : -1,
    [portraits, viewingFile],
  );
  const viewing = viewingIndex >= 0 ? portraits[viewingIndex] : null;

  async function runGeneratePortrait(overrides?: {
    promptOverride: string;
    negativeOverride: string;
  }) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateCharacterPortrait(
        playthrough.id,
        liveCharacter.id,
        {
          note: note.trim() || undefined,
          includeStoryContext,
          ...(overrides
            ? {
                promptOverride: overrides.promptOverride,
                negativeOverride: overrides.negativeOverride,
                promptDurationMs: promptPreview?.promptDurationMs,
                writerPrompt: promptPreview?.writerPrompt,
                writerNegative: promptPreview?.writerNegative,
                promptRequest: promptPreview?.promptRequest,
                promptResponse: promptPreview?.promptResponse,
              }
            : {}),
          signal: controller.signal,
        },
      );
      if (abortRef.current === controller) {
        onPlaythroughChange(res.playthrough);
        setPromptPreview(null);
      }
    } catch (e) {
      if (
        !(e instanceof DOMException && e.name === "AbortError") &&
        abortRef.current === controller
      ) {
        setError(
          e instanceof Error ? e.message : "Failed to generate portrait",
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGenerating(false);
      }
    }
  }

  async function handleStartGenerate() {
    if (!imagePromptPreview) {
      await runGeneratePortrait();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewLoading(true);
    setError(null);
    try {
      const preview = await previewCharacterPortraitPrompt(
        playthrough.id,
        liveCharacter.id,
        {
          note: note.trim() || undefined,
          includeStoryContext,
          signal: controller.signal,
        },
      );
      if (abortRef.current === controller) {
        setPromptPreview(preview);
      }
    } catch (e) {
      if (
        !(e instanceof DOMException && e.name === "AbortError") &&
        abortRef.current === controller
      ) {
        setError(
          e instanceof Error ? e.message : "Failed to write portrait prompt",
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPreviewLoading(false);
      }
    }
  }

  async function handleRerunPrompt() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRerunningPrompt(true);
    setError(null);
    try {
      const preview = await previewCharacterPortraitPrompt(
        playthrough.id,
        liveCharacter.id,
        {
          note: note.trim() || undefined,
          includeStoryContext,
          signal: controller.signal,
        },
      );
      if (abortRef.current === controller) {
        setPromptPreview(preview);
      }
    } catch (e) {
      if (
        !(e instanceof DOMException && e.name === "AbortError") &&
        abortRef.current === controller
      ) {
        setError(
          e instanceof Error ? e.message : "Failed to re-run portrait prompt",
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRerunningPrompt(false);
      }
    }
  }

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = String(reader.result ?? "");
          const comma = res.indexOf(",");
          resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () =>
          reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsDataURL(file);
      });
      const res = await setOrUploadCharacterPortrait(
        playthrough.id,
        liveCharacter.id,
        {
          dataBase64,
          fileName: file.name,
        },
      );
      onPlaythroughChange(res.playthrough);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload portrait",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleSelectPortrait(file: string) {
    setSelectingFile(file);
    setError(null);
    try {
      const res = await setOrUploadCharacterPortrait(
        playthrough.id,
        liveCharacter.id,
        { file },
      );
      onPlaythroughChange(res.playthrough);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to switch portrait",
      );
    } finally {
      setSelectingFile(null);
    }
  }

  async function handleDeletePortrait(file: string) {
    setDeletingFile(file);
    setError(null);
    try {
      const res = await deleteCharacterPortrait(
        playthrough.id,
        liveCharacter.id,
        file,
      );
      onPlaythroughChange(res.playthrough);
      if (viewingFile === file) setViewingFile(null);
      setConfirmDeleteTarget(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete portrait",
      );
    } finally {
      setDeletingFile(null);
    }
  }

  const isBusy = generating || previewLoading || uploading;

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          void handleUploadChange(e);
        }}
      />

      <Modal
        open
        onClose={onClose}
        dismissDisabled={
          isBusy ||
          promptPreview !== null ||
          viewing !== null ||
          confirmDeleteTarget !== null
        }
        size="lg"
        fullScreenMobile
        ariaLabel={`${liveCharacter.name} portrait media`}
        ariaLabelledBy={titleId}
      >
        <Header
          variant="modal"
          icon="IdCard"
          title={`${liveCharacter.name} — Portrait Media`}
          titleId={titleId}
          subtitle="Generate a solo chest-to-head portrait from their current character sheet or manage their turn-by-turn portrait history."
          bordered
          actions={
            <Stack direction="row" align="center" gap="xs" wrap>
              <Button
                variant="secondary"
                size="sm"
                leftIcon="Upload"
                disabled={isBusy}
                isLoading={uploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload Portrait"}
              </Button>
              <Button
                variant="secondary"
                size="xs"
                leftIcon="X"
                disabled={isBusy}
                onClick={onClose}
                aria-label="Close portrait media"
              >
                Close
              </Button>
            </Stack>
          }
        />

        <Modal.Body>
          <Modal.Content>
            <Stack direction="column" align="stretch" gap="md" fullWidth>
              {error ? (
                <StatusMessage
                  variant="banner"
                  tone="err"
                  onDismiss={() => setError(null)}
                >
                  {error}
                </StatusMessage>
              ) : null}

              {/* ── Generate New Portrait Panel ── */}
              <Card variant="panel" padding="md" layout="column" fullWidth>
                <Stack direction="row" align="start" gap="md" wrap fullWidth>
                  <Card variant="elevated" padding="none">
                    <Card.Cover aspect="portrait">
                      <CharacterAvatar
                        template={
                          localTemplate ?? {
                            id: liveCharacter.templateId ?? "",
                            name: liveCharacter.name,
                          }
                        }
                        avatarFile={liveCharacter.avatarFile}
                        playthroughId={playthrough.id}
                        variant="list"
                        alt={liveCharacter.name}
                      />
                    </Card.Cover>
                  </Card>

                  <Stack
                    direction="column"
                    align="stretch"
                    gap="sm"
                    flex1
                    fullWidth
                  >
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      gap="xs"
                      wrap
                      fullWidth
                    >
                      <Stack direction="row" align="center" gap="xs" wrap>
                        <Icon name="Sparkles" size={14} />
                        <Text
                          as="h4"
                          variant="label"
                          size="xs"
                          weight="semibold"
                          uppercase
                        >
                          Generate Character Portrait (Medium Closeup / Chest to
                          Head)
                        </Text>
                      </Stack>
                      <Badge variant="outline" size="xs">
                        Turn {playthrough.turn}
                      </Badge>
                    </Stack>

                    <Text as="p" size="xs" tone="secondary" leading="snug">
                      Creates a solo chest-to-head portrait from{" "}
                      <strong>{liveCharacter.name}</strong>&apos;s current{" "}
                      <code>[Species]</code>, <code>[Gender]</code>,{" "}
                      <code>[Body]</code>, <code>[Appearance]</code>, and
                      equipped clothing. Earlier portraits stay in history so
                      timeline branches before this turn keep their original
                      portrait.
                    </Text>

                    <TextInput
                      label="Pose / Expression / Background Note (optional)"
                      placeholder={`e.g. ${liveCharacter.mood ? `${liveCharacter.mood.replace(/_/g, " ")}, ` : ""}looking over shoulder, warm lantern light`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={isBusy}
                    />

                    <CheckboxRow
                      checked={includeStoryContext}
                      onChange={(e) => setIncludeStoryContext(e.target.checked)}
                      disabled={isBusy}
                      title="Include story context"
                      description="Give the text provider recent story messages and setting for lighting, background atmosphere, and expression context (kept strictly as a solo portrait)."
                    />

                    <Stack
                      direction="row"
                      align="center"
                      justify="end"
                      gap="xs"
                      wrap
                      fullWidth
                    >
                      {(generating || previewLoading) && abortRef.current ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            abortRef.current?.abort();
                            abortRef.current = null;
                            setGenerating(false);
                            setPreviewLoading(false);
                          }}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      <Button
                        variant="ai"
                        size="sm"
                        leftIcon="Sparkles"
                        disabled={isBusy}
                        isLoading={generating || previewLoading}
                        onClick={() => {
                          void handleStartGenerate();
                        }}
                      >
                        {previewLoading
                          ? "Writing Prompt…"
                          : generating
                            ? "Generating Portrait…"
                            : imagePromptPreview
                              ? "Review Prompt & Generate"
                              : "Generate Portrait"}
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Card>

              <Separator spacing="none" />

              {/* ── Portrait Media History ── */}
              <Stack direction="column" align="stretch" gap="sm" fullWidth>
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="xs"
                  fullWidth
                >
                  <Stack direction="row" align="center" gap="xs">
                    <Icon name="Images" size={14} />
                    <Text
                      as="h4"
                      variant="label"
                      size="xs"
                      weight="semibold"
                      tone="secondary"
                      uppercase
                    >
                      Portrait History in This Playthrough
                    </Text>
                  </Stack>
                  <Badge variant="neutral" size="xs" pill>
                    {portraits.length}
                  </Badge>
                </Stack>

                {portraits.length === 0 ? (
                  <StatusMessage variant="inline" tone="neutral" icon="IdCard">
                    No playthrough-specific portraits generated or uploaded for{" "}
                    {liveCharacter.name} yet. Currently using their Character
                    Library avatar (if one exists).
                  </StatusMessage>
                ) : (
                  <FormGrid cols={3} gap="sm">
                    {portraits.map((item) => {
                      const isCurrent = liveCharacter.avatarFile === item.file;
                      return (
                        <Card
                          key={item.file}
                          as="article"
                          variant="panel"
                          padding="none"
                          layout="column"
                          active={isCurrent}
                          hoverable
                        >
                          <Card.Cover
                            position="top"
                            aspect="portrait"
                            overlay={
                              isCurrent ? (
                                <Badge
                                  variant="accent"
                                  size="xs"
                                  pill
                                  leftIcon="Check"
                                >
                                  Current
                                </Badge>
                              ) : undefined
                            }
                          >
                            <button
                              type="button"
                              onClick={() => setViewingFile(item.file)}
                              title={item.prompt || "View portrait"}
                              aria-label="View portrait full size"
                            >
                              <img
                                src={buildImageUrl(item.file, playthrough.id)}
                                alt={
                                  item.prompt.slice(0, 120) ||
                                  liveCharacter.name
                                }
                                loading="lazy"
                                decoding="async"
                              />
                            </button>
                          </Card.Cover>

                          <Card.Body padding="sm" gap="xs">
                            <Stack
                              direction="row"
                              align="center"
                              justify="between"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              <Stack
                                direction="row"
                                align="center"
                                gap="2xs"
                                wrap
                              >
                                {item.turn !== undefined ? (
                                  <Badge variant="outline" size="xs">
                                    Turn {item.turn}
                                  </Badge>
                                ) : null}
                                {!item.providerId ? (
                                  <Badge variant="info" size="xs">
                                    Uploaded
                                  </Badge>
                                ) : null}
                              </Stack>
                              <Text size="2xs" tone="muted">
                                {formatPortraitDate(item.createdAt)}
                              </Text>
                            </Stack>

                            {item.prompt ? (
                              <Text
                                as="p"
                                size="xs"
                                tone="secondary"
                                lineClamp={2}
                                title={item.prompt}
                              >
                                {item.prompt}
                              </Text>
                            ) : null}

                            <Stack
                              direction="row"
                              align="center"
                              justify="between"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              <Stack
                                direction="row"
                                align="center"
                                gap="2xs"
                                wrap
                              >
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  leftIcon="Maximize2"
                                  onClick={() => setViewingFile(item.file)}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  leftIcon="Trash2"
                                  disabled={
                                    isBusy || deletingFile === item.file
                                  }
                                  onClick={() => setConfirmDeleteTarget(item)}
                                >
                                  {deletingFile === item.file
                                    ? "Deleting…"
                                    : "Delete"}
                                </Button>
                              </Stack>
                              <Button
                                variant={isCurrent ? "secondary" : "primary"}
                                size="xs"
                                leftIcon={isCurrent ? "Check" : "User"}
                                disabled={
                                  isBusy ||
                                  isCurrent ||
                                  selectingFile === item.file
                                }
                                isLoading={selectingFile === item.file}
                                onClick={() =>
                                  void handleSelectPortrait(item.file)
                                }
                              >
                                {isCurrent ? "Current" : "Use portrait"}
                              </Button>
                            </Stack>
                          </Card.Body>
                        </Card>
                      );
                    })}
                  </FormGrid>
                )}
              </Stack>
            </Stack>
          </Modal.Content>
        </Modal.Body>
      </Modal>

      {promptPreview ? (
        <ImagePromptModal
          prompt={promptPreview.prompt}
          negativePrompt={promptPreview.negativePrompt}
          warnings={promptPreview.warnings}
          providerLabel={imageConnection?.label}
          model={imageConnection?.model}
          apiStyle={imageConnection?.apiStyle}
          characterLimit={characterLimit}
          generating={generating}
          rerunning={rerunningPrompt}
          promptDurationMs={promptPreview.promptDurationMs}
          context={promptPreview.context}
          onGenerate={(editedPrompt, editedNegative) => {
            void runGeneratePortrait({
              promptOverride: editedPrompt,
              negativeOverride: editedNegative,
            });
          }}
          onRerun={() => {
            void handleRerunPrompt();
          }}
          onClose={() => {
            if (!generating) setPromptPreview(null);
          }}
        />
      ) : null}

      <ImageViewer
        image={
          viewing
            ? {
                src: buildImageUrl(viewing.file, playthrough.id),
                alt: viewing.prompt.slice(0, 120) || liveCharacter.name,
                title: viewing.prompt,
                caption: [
                  liveCharacter.name,
                  viewing.turn !== undefined ? `Turn ${viewing.turn}` : null,
                  new Date(viewing.createdAt).toLocaleString(),
                ]
                  .filter(Boolean)
                  .join(" · "),
              }
            : null
        }
        onClose={() => setViewingFile(null)}
        hasPrev={viewingIndex > 0}
        hasNext={viewingIndex >= 0 && viewingIndex < portraits.length - 1}
        onPrev={
          viewingIndex > 0
            ? () => setViewingFile(portraits[viewingIndex - 1]!.file)
            : undefined
        }
        onNext={
          viewingIndex >= 0 && viewingIndex < portraits.length - 1
            ? () => setViewingFile(portraits[viewingIndex + 1]!.file)
            : undefined
        }
        indexLabel={
          viewingIndex >= 0
            ? `${viewingIndex + 1} / ${portraits.length}`
            : undefined
        }
      />

      {confirmDeleteTarget ? (
        <ConfirmModal
          title={`Delete Portrait for ${liveCharacter.name}?`}
          message={`This will permanently delete this portrait${
            confirmDeleteTarget.turn !== undefined
              ? ` (Turn ${confirmDeleteTarget.turn})`
              : ""
          } from ${liveCharacter.name}'s portrait history.${
            liveCharacter.avatarFile === confirmDeleteTarget.file
              ? " Their active portrait will fall back to the previous portrait (or library default)."
              : ""
          }`}
          confirmLabel={
            deletingFile === confirmDeleteTarget.file
              ? "Deleting…"
              : "Delete Portrait"
          }
          danger
          isLoading={deletingFile === confirmDeleteTarget.file}
          onCancel={() => setConfirmDeleteTarget(null)}
          onConfirm={() => {
            void handleDeletePortrait(confirmDeleteTarget.file);
          }}
        />
      ) : null}
    </>
  );
}
