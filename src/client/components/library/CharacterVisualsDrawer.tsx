import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CharacterTemplate } from "../../../schemas";
import { Icon } from "../base";
import { getCharacterAvatarUrl } from "../../api";
import { ImageCropModal } from "./ImageCropModal";
import { ImageCompareModal } from "./ImageCompareModal";

export type CharacterVisualsDrawerProps = {
  template?: CharacterTemplate | null;
  characterName: string;
  onUploadPortrait: (dataBase64: string, fileName?: string) => Promise<void>;
  onUploadProfile: (dataBase64: string, fileName?: string) => Promise<void>;
  onRestoreOriginalPortrait: () => Promise<void>;
  onDeleteProfile: () => Promise<void>;
  disabled?: boolean;
};

export function CharacterVisualsDrawer({
  template,
  characterName,
  onUploadPortrait,
  onUploadProfile,
  onRestoreOriginalPortrait,
  onDeleteProfile,
  disabled = false,
}: CharacterVisualsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError?: boolean } | null>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const portraitInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  const charId = template?.id;
  const updatedAt = template?.avatarUpdatedAt;

  const hasOriginalCcv2 = template?.cardRef?.kind === "png";
  const hasCustomPortrait = !!template?.customPortrait;
  const hasProfileImage = !!template?.profileImage;

  const portraitUrl = charId ? getCharacterAvatarUrl(charId, "portrait", updatedAt) : null;
  const profileUrl = charId ? getCharacterAvatarUrl(charId, "profile", updatedAt) : null;
  const originalUrl = charId && hasOriginalCcv2 ? getCharacterAvatarUrl(charId, "original", updatedAt) : null;

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
      setStatus({ text: "Portrait updated successfully." });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Failed to upload portrait.", isError: true });
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
      setStatus({ text: "Profile avatar updated successfully." });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Failed to upload profile avatar.", isError: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyCrop(dataBase64: string) {
    setLoading(true);
    setStatus(null);
    try {
      await onUploadProfile(dataBase64, "profile.png");
      setCropModalOpen(false);
      setStatus({ text: "Profile avatar cropped and saved." });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Failed to save cropped avatar.", isError: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleRestoreOriginal() {
    setLoading(true);
    setStatus(null);
    try {
      await onRestoreOriginalPortrait();
      setCompareModalOpen(false);
      setStatus({ text: "Restored original CCv2 card artwork." });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Failed to restore artwork.", isError: true });
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
      setStatus({ text: err instanceof Error ? err.message : "Failed to reset profile avatar.", isError: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`character-visuals-drawer ${isOpen ? "is-open" : "is-closed"}`}>
      {/* Top Toggle Bar */}
      <button
        type="button"
        className="visuals-drawer-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        title={isOpen ? "Collapse Visuals Drawer" : "Expand Visuals Drawer"}
      >
        <div className="drawer-header-left">
          <span className="drawer-icon">
            <Icon name="Image" size={15} />
          </span>
          <span className="drawer-title">Character Visuals &amp; Artwork</span>

          {/* Mini preview pill when collapsed */}
          <div className="drawer-mini-pills">
            {hasOriginalCcv2 && !hasCustomPortrait && (
              <span className="visuals-pill ccv2">CCv2 Original</span>
            )}
            {hasCustomPortrait && (
              <span className="visuals-pill custom">Custom Portrait</span>
            )}
            {hasProfileImage && (
              <span className="visuals-pill profile">1:1 Profile Set</span>
            )}
          </div>
        </div>

        <div className="drawer-header-right">
          <span className="drawer-toggle-text">{isOpen ? "Hide Artwork" : "Edit Artwork"}</span>
          <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={14} className="drawer-chevron" />
        </div>
      </button>

      {/* Expanded Content Body */}
      {isOpen && (
        <div className="visuals-drawer-body">
          {status && (
            <div className={`drawer-status-msg ${status.isError ? "status-error" : "status-success"}`}>
              <Icon name={status.isError ? "AlertTriangle" : "CheckCircle2"} size={13} />
              <span>{status.text}</span>
            </div>
          )}

          {!charId ? (
            <div className="drawer-notice-box">
              <Icon name="Info" size={14} />
              <span>Save this character card first to upload, crop, and manage artwork.</span>
            </div>
          ) : (
            <div className="visuals-slots-grid">
              {/* Slot 1: Full Portrait */}
              <div className="visual-slot-card portrait-slot">
                <div className="slot-card-header">
                  <span className="slot-title">
                    <Icon name="IdCard" size={14} /> Full Portrait
                  </span>
                  {hasOriginalCcv2 && !hasCustomPortrait ? (
                    <span className="slot-badge ccv2">CCv2 Card</span>
                  ) : hasCustomPortrait ? (
                    <span className="slot-badge custom">Custom Upload</span>
                  ) : null}
                </div>

                <div className="slot-image-preview portrait-preview">
                  {portraitUrl ? (
                    <img
                      src={portraitUrl}
                      alt={`${characterName} full portrait`}
                      className="slot-img portrait-img"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="slot-placeholder portrait-placeholder">
                      <Icon name="Image" size={28} />
                      <span>No portrait</span>
                    </div>
                  )}
                </div>

                <div className="slot-actions">
                  <button
                    type="button"
                    className="visual-action-btn primary-action"
                    onClick={() => portraitInputRef.current?.click()}
                    disabled={disabled || loading}
                    title="Upload replacement portrait image"
                  >
                    <Icon name="Upload" size={13} /> Upload Portrait
                  </button>
                  <input
                    ref={portraitInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={handlePortraitFileChange}
                  />

                  {hasOriginalCcv2 && hasCustomPortrait && (
                    <>
                      <button
                        type="button"
                        className="visual-action-btn secondary-action"
                        onClick={() => setCompareModalOpen(true)}
                        disabled={disabled || loading}
                        title="Compare custom portrait with original CCv2 card art"
                      >
                        <Icon name="Layers" size={13} /> Compare
                      </button>
                      <button
                        type="button"
                        className="visual-action-btn warning-action"
                        onClick={handleRestoreOriginal}
                        disabled={disabled || loading}
                        title="Restore original CCv2 artwork"
                      >
                        <Icon name="RotateCcw" size={13} /> Restore
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Slot 2: 1:1 Profile Avatar */}
              <div className="visual-slot-card profile-slot">
                <div className="slot-card-header">
                  <span className="slot-title">
                    <Icon name="User" size={14} /> Profile (1:1 Face)
                  </span>
                  {hasProfileImage ? (
                    <span className="slot-badge profile">Custom 1:1</span>
                  ) : (
                    <span className="slot-badge fallback">Using Portrait</span>
                  )}
                </div>

                <div className="slot-image-preview profile-preview">
                  {profileUrl ? (
                    <img
                      src={profileUrl}
                      alt={`${characterName} 1:1 profile`}
                      className="slot-img profile-img"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="slot-placeholder profile-placeholder">
                      <Icon name="User" size={28} />
                      <span>No profile</span>
                    </div>
                  )}
                </div>

                <div className="slot-actions">
                  <button
                    type="button"
                    className="visual-action-btn primary-action"
                    onClick={() => setCropModalOpen(true)}
                    disabled={disabled || loading || !portraitUrl}
                    title="Open interactive face cropper from full portrait"
                  >
                    <Icon name="Scissors" size={13} /> Crop from Portrait
                  </button>

                  <button
                    type="button"
                    className="visual-action-btn secondary-action"
                    onClick={() => profileInputRef.current?.click()}
                    disabled={disabled || loading}
                    title="Upload direct 1:1 square image"
                  >
                    <Icon name="Upload" size={13} /> Upload 1:1
                  </button>
                  <input
                    ref={profileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={handleProfileFileChange}
                  />

                  {hasProfileImage && (
                    <button
                      type="button"
                      className="visual-action-btn danger-action"
                      onClick={handleRemoveProfile}
                      disabled={disabled || loading}
                      title="Remove custom 1:1 avatar and fall back to full portrait"
                    >
                      <Icon name="Trash2" size={13} /> Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Crop Modal */}
      {cropModalOpen && portraitUrl && (
        <ImageCropModal
          imageSrc={portraitUrl}
          characterName={characterName}
          onApply={handleApplyCrop}
          onClose={() => setCropModalOpen(false)}
          loading={loading}
        />
      )}

      {/* Compare Modal */}
      {compareModalOpen && originalUrl && portraitUrl && (
        <ImageCompareModal
          originalSrc={originalUrl}
          currentSrc={portraitUrl}
          characterName={characterName}
          onRestore={handleRestoreOriginal}
          onClose={() => setCompareModalOpen(false)}
          loading={loading}
        />
      )}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
