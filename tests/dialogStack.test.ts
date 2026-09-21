import { beforeEach, describe, expect, it } from "vitest";
import {
  isTopDialog,
  popDialog,
  pushDialog,
  resetDialogStack,
  topDialogId
} from "../src/client/engine/dialogStack";

describe("the dialog stack", () => {
  beforeEach(() => resetDialogStack());

  it("makes the most recently opened dialog the top one", () => {
    pushDialog("sheet");
    expect(topDialogId()).toBe("sheet");
    expect(isTopDialog("sheet")).toBe(true);

    pushDialog("confirm");
    expect(topDialogId()).toBe("confirm");
    expect(isTopDialog("confirm")).toBe(true);
    // The sheet beneath it is inert while the confirm is open.
    expect(isTopDialog("sheet")).toBe(false);
  });

  it("hands the top back when the topmost dialog closes", () => {
    pushDialog("sheet");
    pushDialog("confirm");
    popDialog("confirm");
    expect(topDialogId()).toBe("sheet");
    expect(isTopDialog("sheet")).toBe(true);
  });

  it("lets a buried dialog close without disturbing the top", () => {
    pushDialog("sheet");
    pushDialog("confirm");
    // A parent unmounting while a child confirm is open: the confirm stays in charge.
    popDialog("sheet");
    expect(topDialogId()).toBe("confirm");
  });

  it("ignores a duplicate registration", () => {
    pushDialog("sheet");
    pushDialog("sheet");
    popDialog("sheet");
    expect(topDialogId()).toBe(null);
  });

  it("reports nothing as top when nothing is open", () => {
    expect(topDialogId()).toBe(null);
    expect(isTopDialog("sheet")).toBe(false);
  });
});
