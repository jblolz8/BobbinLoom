import { useMemo, useRef, useState } from "react";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import { type AttachMessageImagePayload, buildImageUrl } from "../../../api";
import { buildCoverMedia } from "../../../engine/coverMedia";
import {
  Badge,
  Button,
  Card,
  CheckboxRow,
  FormGrid,
  Header,
  IconButton,
  Modal,
  SearchBar,
  Stack,
  StatusMessage,
  type TabItem,
  Tabs,
  Text,
  TextInput,
} from "../../base";

export type AttachImageModalProps = {
  playthrough: Playthrough;
  message: ChatMessage;
  attaching: boolean;
  errorMessage?: string | null;
  onAttach: (payload: AttachMessageImagePayload) => void;
  onClose: () => void;
};

type AttachTabId = "upload" | "gallery";

function readFileAsBase64(
  file: File,
): Promise<{ dataUrl: string; dataBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      const dataBase64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      resolve({
        dataUrl: result,
        dataBase64,
        mimeType: file.type || "image/png",
      });
    };
    reader.onerror = () =>
      reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function AttachImageModal({
  playthrough,
  message,
  attaching,
  errorMessage,
  onAttach,
  onClose,
}: AttachImageModalProps) {
  const media = useMemo(() => buildCoverMedia(playthrough), [playthrough]);
  const attachedFiles = useMemo(
    () => new Set((message.images ?? []).map((img) => img.file)),
    [message.images],
  );

  const [activeTab, setActiveTab] = useState<AttachTabId>("upload");
  const [selectedUpload, setSelectedUpload] = useState<{
    name: string;
    dataUrl: string;
    dataBase64: string;
    mimeType: string;
  } | null>(null);
  const [label, setLabel] = useState("");
  const [useAsCover, setUseAsCover] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [gallerySearch, setGallerySearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const tabs: TabItem<AttachTabId>[] = useMemo(
    () => [
      { id: "upload", label: "Upload New", icon: "Upload" },
      {
        id: "gallery",
        label: "From Playthrough Gallery",
        icon: "Images",
        badge: media.length,
      },
    ],
    [media.length],
  );

  const filteredGallery = useMemo(() => {
    const q = gallerySearch.trim().toLowerCase();
    if (!q) return media;
    return media.filter((item) => {
      const hay = [
        item.prompt,
        item.chapterName ?? "",
        item.turn !== undefined ? `turn ${item.turn}` : "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [media, gallerySearch]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLocalError(null);
    try {
      const parsed = await readFileAsBase64(file);
      const defaultStem = file.name.replace(/\.[^.]+$/, "").trim();
      setSelectedUpload({
        name: file.name,
        ...parsed,
      });
      if (!label.trim() && defaultStem) {
        setLabel(defaultStem);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleConfirmUpload() {
    if (!selectedUpload) return;
    onAttach({
      dataBase64: selectedUpload.dataBase64,
      fileName: selectedUpload.name,
      label: label.trim() || undefined,
      useAsCover: useAsCover || undefined,
    });
  }

  function handlePickGalleryItem(file: string, defaultPrompt: string) {
    onAttach({
      file,
      label: defaultPrompt || undefined,
      useAsCover: useAsCover || undefined,
    });
  }

  const displayError = errorMessage || localError;
  const roleLabel = message.role === "user" ? "User" : "Assistant";

  return (
    <Modal
      open
      onClose={attaching ? undefined : onClose}
      size="lg"
      ariaLabel="Attach image to message"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFileSelect(e);
        }}
      />

      <Header
        variant="modal"
        icon="ImagePlus"
        title="Attach Image to Message"
        subtitle={`${roleLabel} message · Turn ${message.turn ?? playthrough.turn}`}
        actions={
          <IconButton
            icon="X"
            size="sm"
            variant="ghost"
            label="Close"
            disabled={attaching}
            onClick={onClose}
          />
        }
      />

      <Modal.Body>
        <Stack direction="column" align="stretch" gap="md" fullWidth>
          <Tabs<AttachTabId>
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            variant="segmented"
            size="sm"
          />

          {displayError ? (
            <StatusMessage variant="banner" tone="err">
              {displayError}
            </StatusMessage>
          ) : null}

          {activeTab === "upload" ? (
            <Stack direction="column" align="stretch" gap="md" fullWidth>
              {selectedUpload ? (
                <Card variant="panel" padding="sm" layout="column" fullWidth>
                  <Stack direction="column" align="stretch" gap="sm" fullWidth>
                    <Card.Cover aspect="square">
                      <img
                        src={selectedUpload.dataUrl}
                        alt={label || selectedUpload.name}
                      />
                    </Card.Cover>
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      gap="xs"
                      wrap
                      fullWidth
                    >
                      <Text size="xs" tone="secondary">
                        {selectedUpload.name}
                      </Text>
                      <Button
                        variant="secondary"
                        size="xs"
                        leftIcon="Upload"
                        disabled={attaching}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose another file
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              ) : (
                <Card variant="panel" padding="lg" layout="column" fullWidth>
                  <Stack
                    direction="column"
                    align="center"
                    justify="center"
                    gap="sm"
                    fullWidth
                  >
                    <Text size="sm" weight="medium">
                      Upload a PNG, JPEG, or WebP image
                    </Text>
                    <Text size="xs" tone="muted">
                      Images are automatically optimized and stored in this
                      playthrough&apos;s folder.
                    </Text>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon="Upload"
                      disabled={attaching}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose Image File…
                    </Button>
                  </Stack>
                </Card>
              )}

              <TextInput
                label="Caption / Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Describe this image or leave blank…"
                disabled={attaching}
              />

              <CheckboxRow
                checked={useAsCover}
                onChange={(e) => setUseAsCover(e.target.checked)}
                disabled={attaching}
                title="Use as Cover"
                description="Also set this image as the playthrough's cover."
              />
            </Stack>
          ) : (
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              {media.length === 0 ? (
                <StatusMessage variant="inline" tone="neutral" icon="Image">
                  This playthrough has no images in its gallery yet. Switch to{" "}
                  <strong>Upload New</strong> to upload and attach an image.
                </StatusMessage>
              ) : (
                <>
                  <SearchBar
                    value={gallerySearch}
                    onChange={setGallerySearch}
                    placeholder="Search gallery images by prompt, label, chapter, or turn…"
                    size="sm"
                  />

                  {filteredGallery.length === 0 ? (
                    <StatusMessage
                      variant="inline"
                      tone="neutral"
                      icon="Search"
                    >
                      No gallery images match “{gallerySearch.trim()}”.
                    </StatusMessage>
                  ) : (
                    <FormGrid cols={3} gap="sm">
                      {filteredGallery.map((item) => {
                        const alreadyAttached = attachedFiles.has(item.file);
                        return (
                          <Card
                            key={item.file}
                            as="article"
                            variant="panel"
                            padding="none"
                            layout="column"
                            active={alreadyAttached}
                            hoverable={!alreadyAttached}
                          >
                            <Card.Cover
                              position="top"
                              aspect="square"
                              overlay={
                                alreadyAttached ? (
                                  <Badge
                                    variant="neutral"
                                    size="xs"
                                    pill
                                    leftIcon="Check"
                                  >
                                    Attached
                                  </Badge>
                                ) : item.isUploaded ? (
                                  <Badge variant="info" size="xs" pill>
                                    Uploaded
                                  </Badge>
                                ) : undefined
                              }
                            >
                              <img
                                src={buildImageUrl(item.file, playthrough.id)}
                                alt={item.prompt.slice(0, 120)}
                                loading="lazy"
                                decoding="async"
                              />
                            </Card.Cover>

                            <Card.Body padding="sm" gap="xs">
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
                              ) : (
                                <Text as="p" size="xs" tone="muted" italic>
                                  No caption
                                </Text>
                              )}

                              <Button
                                variant={
                                  alreadyAttached ? "secondary" : "primary"
                                }
                                size="xs"
                                leftIcon={
                                  alreadyAttached ? "Check" : "ImagePlus"
                                }
                                disabled={attaching || alreadyAttached}
                                isLoading={attaching}
                                onClick={() =>
                                  handlePickGalleryItem(item.file, item.prompt)
                                }
                              >
                                {alreadyAttached
                                  ? "Already attached"
                                  : "Attach to message"}
                              </Button>
                            </Card.Body>
                          </Card>
                        );
                      })}
                    </FormGrid>
                  )}
                </>
              )}
            </Stack>
          )}
        </Stack>
      </Modal.Body>

      <Modal.Footer>
        <Stack
          direction="row"
          align="center"
          justify="end"
          gap="xs"
          wrap
          fullWidth
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={attaching}
            onClick={onClose}
          >
            Cancel
          </Button>
          {activeTab === "upload" ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon="ImagePlus"
              disabled={!selectedUpload || attaching}
              isLoading={attaching}
              onClick={handleConfirmUpload}
            >
              {attaching ? "Attaching…" : "Attach Image"}
            </Button>
          ) : null}
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
