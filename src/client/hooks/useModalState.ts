import { useState } from "react";

export type ModalType = "settings" | "persona" | "character" | "lorebook" | null;

export function useModalState() {
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  return {
    activeModal,
    settingsOpen: activeModal === "settings",
    personaManagerOpen: activeModal === "persona",
    characterManagerOpen: activeModal === "character",
    lorebookManagerOpen: activeModal === "lorebook",
    openSettings: () => setActiveModal("settings"),
    openPersona: () => setActiveModal("persona"),
    openCharacter: () => setActiveModal("character"),
    openLorebook: () => setActiveModal("lorebook"),
    closeModal: () => setActiveModal(null),
    setSettingsOpen: (open: boolean) => setActiveModal(open ? "settings" : null),
    setPersonaManagerOpen: (open: boolean) => setActiveModal(open ? "persona" : null),
    setCharacterManagerOpen: (open: boolean) => setActiveModal(open ? "character" : null),
    setLorebookManagerOpen: (open: boolean) => setActiveModal(open ? "lorebook" : null),
  };
}
