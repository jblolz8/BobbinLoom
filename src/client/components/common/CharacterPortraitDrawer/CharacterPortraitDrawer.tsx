import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  Stack,
  StatusMessage,
  Text,
} from "../../base";
import { ImageCropModal } from "./ImageCropModal";
import { ImageCompareModal } from "./ImageCompareModal";
import "./CharacterPortraitDrawer.css";

export type CharacterPortraitDrawerProps = {
  entityId?: string | null;
  entityName: string;
  /** Label used in the unsaved notice (defaults to "character"). */
  entityLabel?: string;
  portraitUrl?: string | null;
  profileUrl?: string | null;
  originalUrl?: string | null;
  hasOriginalCcv2?: boolean;
  hasCustomPortrait?: boolean;
  hasProfileImage?: boolean;
  onUploadPortrait: (dataBase64: string, fileName?: string) => Promise<void>;
  onUploadProfile: (dataBase64: string, fileName?: string) => Promise<void>;
  onRestoreOriginalPortrait?: () => Promise<void>;
  onDeletePortrait?: () => Promise<void>;
  onDeleteProfile: () => Promise<void>;
  disabled?: boolean;
};

export function CharacterPortraitDrawer({
  entityId,
  entityName,
  entityLabel = "character",
  portraitUrl,
  profileUrl,
  originalUrl,
  hasOriginalCcv2 = false,
  hasCustomPortrait = false,
  hasProfileImage = false,
  onUploadPortrait,
  onUploadProfile,
  onRestoreOriginalPortrait,
  onDeletePortrait,
  onDeleteProfile,
  disabled = false,
}: CharacterPortraitDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const [portraitFailed, setPortraitFailed] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);

  const portraitInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPortraitFailed(false);
  }, [portraitUrl]);

  useEffect(() => {
    setProfileFailed(false);
  }, [profileUrl]);

  const canShowPortrait = Boolean(portraitUrl) && !portraitFailed;
  const canShowProfile = Boolean(profileUrl) && !profileFailed;

  async function handlePortraitFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLoading(true);
    setStatus(null);
    try {
      const dataUrl = await readFileAsBase64(file);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      await onUploadPortrait(base64, file.name);
      setPortraitFailed(false);
      setProfileFailed(false);
      setStatus({ text: "Portrait updated." });
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : "Failed to upload portrait.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLoading(true);
    setStatus(null);
    try {
      const dataUrl = await readFileAsBase64(file);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      await onUploadProfile(base64, file.name);
      setProfileFailed(false);
      setStatus({ text: "Profile avatar updated." });
    } catch (err) {
      setStatus({
        text:
          err instanceof Error
            ? err.message
            : "Failed to upload profile avatar.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyCrop(dataBase64: string) {
    setLoading(true);
    setStatus(null);
    try {
      await onUploadProfile(dataBase64, "profile.png");
      setProfileFailed(false);
      setCropModalOpen(false);
      setStatus({ text: "Profile avatar cropped and saved." });
    } catch (err) {
      setStatus({
        text:
          err instanceof Error ? err.message : "Failed to save cropped avatar.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRestoreOriginal() {
    if (!onRestoreOriginalPortrait) return;
    setLoading(true);
    setStatus(null);
    try {
      await onRestoreOriginalPortrait();
      setPortraitFailed(false);
      setCompareModalOpen(false);
      setStatus({ text: "Restored original CCv2 card portrait." });
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : "Failed to restore portrait.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemovePortrait() {
    if (!onDeletePortrait) return;
    setLoading(true);
    setStatus(null);
    try {
      await onDeletePortrait();
      setStatus({ text: "Custom portrait removed." });
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : "Failed to remove portrait.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveProfile() {
    setLoading(true);
    setStatus(null);
    try {
      await onDeleteProfile();
      setStatus({ text: "Profile avatar reset to portrait fallback." });
    } catch (err) {
      setStatus({
        text:
          err instanceof Error
            ? err.message
            : "Failed to reset profile avatar.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`character-portrait-drawer ${isOpen ? "is-open" : "is-closed"}`}
    >
      <button
        type="button"
        className="character-portrait-drawer-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        title={isOpen ? "Collapse Character Portrait" : "Expand Character Portrait"}
      >
        <Stack direction="row" align="center" gap="sm" wrap>
          <span className="character-portrait-drawer-icon">
            <Icon name="Image" size={15} />
          </span>
          <Text as="span" variant="body" weight="semibold">
            Character Portrait
          </Text>

          <Stack direction="row" align="center" gap="xs" wrap>
            {hasOriginalCcv2 && !hasCustomPortrait ? (
              <Badge variant="info" size="xs">
                CCv2 Original
              </Badge>
            ) : null}
            {hasCustomPortrait ? (
              <Badge variant="accent" size="xs">
                Custom Portrait
              </Badge>
            ) : null}
            {hasProfileImage ? (
              <Badge variant="success" size="xs">
                1:1 Profile Set
              </Badge>
            ) : null}
          </Stack>
        </Stack>

        <Stack direction="row" align="center" gap="xs">
          <Text as="span" variant="caption" color="muted">
            {isOpen ? "Hide Portrait" : "Edit Portrait"}
          </Text>
          <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={14} />
        </Stack>
      </button>

      {isOpen ? (
        <div className="character-portrait-drawer-body">
          <Stack direction="column" align="stretch" gap="sm" fullWidth>
            {status ? (
              <StatusMessage
                variant="banner"
                tone={status.isError ? "err" : "ok"}
                onDismiss={() => setStatus(null)}
              >
                {status.text}
              </StatusMessage>
            ) : null}

            {!entityId ? (
              <StatusMessage variant="banner" tone="neutral">
                Save this {entityLabel} first to upload and crop a portrait.
              </StatusMessage>
            ) : (
              <div className="character-portrait-slots-grid">
                {/* Slot 1: Full Portrait */}
                <Card variant="elevated" padding="md">
                  <Stack
                    direction="column"
                    justify="between"
                    gap="sm"
                    fullWidth
                  >
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      gap="xs"
                    >
                      <Stack direction="row" align="center" gap="xs">
                        <Icon name="IdCard" size={14} />
                        <Text as="span" variant="label" weight="semibold">
                          Full Portrait
                        </Text>
                      </Stack>
                      {hasOriginalCcv2 && !hasCustomPortrait ? (
                        <Badge variant="info" size="xs">
                          CCv2 Card
                        </Badge>
                      ) : hasCustomPortrait ? (
                        <Badge variant="accent" size="xs">
                          Custom Upload
                        </Badge>
                      ) : null}
                    </Stack>

                    <div className="character-portrait-preview-frame character-portrait-preview-frame--portrait">
                      {canShowPortrait && portraitUrl ? (
                        <img
                          src={portraitUrl}
                          alt={`${entityName || entityLabel} full portrait`}
                          className="character-portrait-img--portrait"
                          onError={() => setPortraitFailed(true)}
                        />
                      ) : (
                        <div className="character-portrait-placeholder character-portrait-placeholder--portrait">
                          <Icon name="Image" size={28} />
                          <span>No portrait (2:3)</span>
                        </div>
                      )}
                    </div>

                    <Stack direction="row" align="center" gap="xs" wrap>
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon="Upload"
                        onClick={() => portraitInputRef.current?.click()}
                        disabled={disabled || loading}
                        title="Upload portrait image"
                      >
                        Upload Portrait
                      </Button>
                      <input
                        ref={portraitInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        onChange={handlePortraitFileChange}
                      />

                      {hasOriginalCcv2 &&
                      hasCustomPortrait &&
                      originalUrl &&
                      onRestoreOriginalPortrait ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon="Layers"
                            onClick={() => setCompareModalOpen(true)}
                            disabled={disabled || loading}
                            title="Compare custom portrait with original CCv2 card art"
                          >
                            Compare
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon="RotateCcw"
                            onClick={() => void handleRestoreOriginal()}
                            disabled={disabled || loading}
                            title="Restore original CCv2 artwork"
                          >
                            Restore
                          </Button>
                        </>
                      ) : null}

                      {!hasOriginalCcv2 &&
                      hasCustomPortrait &&
                      onDeletePortrait ? (
                        <Button
                          variant="danger"
                          size="sm"
                          leftIcon="Trash2"
                          onClick={() => void handleRemovePortrait()}
                          disabled={disabled || loading}
                          title="Remove custom portrait"
                        >
                          Remove
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>
                </Card>

                {/* Slot 2: 1:1 Profile Avatar */}
                <Card variant="elevated" padding="md">
                  <Stack
                    direction="column"
                    justify="between"
                    gap="sm"
                    fullWidth
                  >
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      gap="xs"
                    >
                      <Stack direction="row" align="center" gap="xs">
                        <Icon name="User" size={14} />
                        <Text as="span" variant="label" weight="semibold">
                          Profile (1:1 Face)
                        </Text>
                      </Stack>
                      {hasProfileImage ? (
                        <Badge variant="success" size="xs">
                          Custom 1:1
                        </Badge>
                      ) : canShowPortrait ? (
                        <Badge variant="neutral" size="xs">
                          Using Portrait
                        </Badge>
                      ) : null}
                    </Stack>

                    <div className="character-portrait-preview-frame character-portrait-preview-frame--profile">
                      {canShowProfile && profileUrl ? (
                        <img
                          src={profileUrl}
                          alt={`${entityName || entityLabel} 1:1 profile`}
                          className="character-portrait-img--profile"
                          onError={() => setProfileFailed(true)}
                        />
                      ) : (
                        <div className="character-portrait-placeholder character-portrait-placeholder--profile">
                          <Icon name="User" size={28} />
                          <span>No profile (1:1)</span>
                        </div>
                      )}
                    </div>

                    <Stack direction="row" align="center" gap="xs" wrap>
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon="Scissors"
                        onClick={() => setCropModalOpen(true)}
                        disabled={disabled || loading || !canShowPortrait}
                        title="Open interactive 1:1 cropper from full portrait"
                      >
                        Crop from Portrait
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon="Upload"
                        onClick={() => profileInputRef.current?.click()}
                        disabled={disabled || loading}
                        title="Upload direct 1:1 square image"
                      >
                        Upload 1:1
                      </Button>
                      <input
                        ref={profileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        onChange={handleProfileFileChange}
                      />

                      {hasProfileImage ? (
                        <Button
                          variant="danger"
                          size="sm"
                          leftIcon="Trash2"
                          onClick={() => void handleRemoveProfile()}
                          disabled={disabled || loading}
                          title="Remove custom 1:1 avatar and fall back to full portrait"
                        >
                          Reset
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>
                </Card>
              </div>
            )}
          </Stack>
        </div>
      ) : null}

      {cropModalOpen && portraitUrl && canShowPortrait ? (
        <ImageCropModal
          imageSrc={portraitUrl}
          characterName={entityName || entityLabel}
          onApply={handleApplyCrop}
          onClose={() => setCropModalOpen(false)}
          loading={loading}
        />
      ) : null}

      {compareModalOpen && originalUrl && portraitUrl ? (
        <ImageCompareModal
          originalSrc={originalUrl}
          currentSrc={portraitUrl}
          characterName={entityName || entityLabel}
          onRestore={() => void handleRestoreOriginal()}
          onClose={() => setCompareModalOpen(false)}
          loading={loading}
        />
      ) : null}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
