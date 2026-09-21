/**
 * The confirm dialog's action row is a contract — `[confirm][secondary actions…][cancel]` — and it is
 * the one part of a dialog a refactor can reorder without a type error. `ConfirmModal` renders through
 * a portal, so it cannot be rendered outside a browser (there is no jsdom here); `ConfirmActions` is
 * the row on its own, and this pins it.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "../src/client/components/base";
import { ConfirmActions } from "../src/client/components/common/ConfirmModal";

/** The visible labels, in DOM order — the whole point of the test. */
function labels(html: string): string[] {
  return [...html.matchAll(/<span class="base-btn__label">([^<]*)<\/span>/g)].map((match) => match[1]);
}

const backupButton = () => createElement(Button, { variant: "secondary" }, "Duplicate as backup");

describe("the confirm dialog's action row", () => {
  it("orders the row confirm, secondary actions, then Cancel", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmActions, {
        confirmLabel: "Retry this response",
        danger: true,
        secondaryActions: backupButton(),
        onConfirm: () => {},
        onCancel: () => {}
      })
    );

    expect(labels(html)).toEqual(["Retry this response", "Duplicate as backup", "Cancel"]);
    expect(html.startsWith('<div class="settings-actions">')).toBe(true);
    expect(html).toContain("base-btn--danger");
  });

  it("keeps a secondary action out of the confirm's own state", () => {
    // The backup must never read as part of the destructive action: the busy state belongs to the
    // confirm alone, so exactly one spinner may exist however many actions the row holds.
    const html = renderToStaticMarkup(
      createElement(ConfirmActions, {
        confirmLabel: "Retry this response",
        danger: true,
        isLoading: true,
        confirmDisabled: true,
        secondaryActions: backupButton(),
        onConfirm: () => {},
        onCancel: () => {}
      })
    );

    expect((html.match(/base-btn__spinner/g) ?? []).length).toBe(1);
  });
});
