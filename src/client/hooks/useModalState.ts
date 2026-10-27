import { useState } from "react";

export type ModalType =
  | "settings"
  | "persona"
  | "character"
  | "lorebook"
  | "setup"
  | null;

export function useModalState() {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [returnToSetup, setReturnToSetup] = useState(false);

  function openSubModal(target: Exclude<ModalType, "setup" | null>) {
    setActiveModal((prev) => {
      if (prev === "setup") {
        setReturnToSetup(true);
      }
      return target;
    });
  }

  function closeModal() {
    setActiveModal((prev) => {
      if (prev !== "setup" && returnToSetup) {
        setReturnToSetup(false);
        return "setup";
      }
      setReturnToSetup(false);
      return null;
    });
  }

  return {
    activeModal,
    settingsOpen: activeModal === "settings",
    personaManagerOpen: activeModal === "persona",
    characterManagerOpen: activeModal === "character",
    lorebookManagerOpen: activeModal === "lorebook",
    setupOpen: activeModal === "setup",
    openSettings: () => openSubModal("settings"),
    openPersona: () => openSubModal("persona"),
    openCharacter: () => openSubModal("character"),
    openLorebook: () => openSubModal("lorebook"),
    openSetup: () => {
      setReturnToSetup(false);
      setActiveModal("setup");
    },
    closeModal,
    setSettingsOpen: (open: boolean) => {
      if (open) openSubModal("settings");
      else closeModal();
    },
    setPersonaManagerOpen: (open: boolean) => {
      if (open) openSubModal("persona");
      else closeModal();
    },
    setCharacterManagerOpen: (open: boolean) => {
      if (open) openSubModal("character");
      else closeModal();
    },
    setLorebookManagerOpen: (open: boolean) => {
      if (open) openSubModal("lorebook");
      else closeModal();
    },
    setSetupOpen: (open: boolean) => {
      setReturnToSetup(false);
      setActiveModal(open ? "setup" : null);
    },
  };
}
