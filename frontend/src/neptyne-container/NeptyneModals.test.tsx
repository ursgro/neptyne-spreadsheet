import React, { MutableRefObject, ReactElement, useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ModalDispatch,
  ModalReducerAction,
  ModalReducerShowProps,
  NeptyneModals,
  useModalDispatch,
} from "./NeptyneModals";
import noop from "lodash/noop";
import { NoteDialog } from "../components/ToolbarControls/NoteDialog";
import { LinkDialog } from "../components/ToolbarControls/LinkDialog";
import { ShareDialogDataWrapper } from "../ShareDialog/ShareDialogDataWrapper";
import {
  AllowAnonymous,
  OpenTyneDialogDataWrapper,
} from "../components/OpenDialog/OpenTyneDialogDataWrapper";
import { WidgetRegistry } from "../NeptyneProtocol";
import { AutocompleteResponse } from "../notebook/NotebookCellEditor/types";
import { User } from "../user-context";

const TESTED_MODALS = [
  [OpenTyneDialogDataWrapper, screen.findAllByText.bind(screen, "Test Tyne")],
  [ShareDialogDataWrapper, screen.findByText.bind(screen, 'Share "Test Tyne"')],
  [NoteDialog, null],
  [LinkDialog, null],
] as [ModalReducerShowProps["element"], (() => Promise<HTMLElement>) | null][];

const MOCK_USER = { displayName: "Me", email: "me@meptyne.com" } as User;

const MOCK_MODAL_PROPS = {
  onToggle: noop,
  currentCellAttributes: {},
  onCellAttributeChange: noop,
  onUpdateCellValues: noop,
  widgetRegistry: {} as WidgetRegistry,
  sheetSelection: {
    start: {
      row: 0,
      col: 0,
    },
    end: {
      row: 0,
      col: 0,
    },
  },
  currentSheet: 0,
  getAutocomplete: noop as () => Promise<AutocompleteResponse>,
  getWidgetState: noop as () => Promise<{ [name: string]: string }>,
  validateWidgetParams: noop as () => Promise<{ [name: string]: string }>,
  onCreateFunctionSubmit: noop,
  user: MOCK_USER,
  allowAnonymous: "no" as AllowAnonymous,
  errorMessage: null,
  notificationMessage: null,
  onTyneAction: noop,
  tyneId: "test_tyne",
  tyneName: "Test Tyne",
};

jest.mock("../authenticatedFetch", () => {
  return async function authenticatedFetch(
    _: unknown,
    info: Parameters<typeof fetch>[0]
  ) {
    const path = info.toString();
    return {
      async json() {
        if (path === "/api/tyne_list")
          return {
            tynes: [
              {
                access: "EDIT",
                categories: ["editableByMe", "authoredByMe"],
                fileName: "test",
                galleryScreenshotUrl: null,
                lastModified: "2022-08-26T16:00:13.433923",
                name: "Test Tyne",
                owner: "Test User",
                ownerColor: "#e8f5a3",
                ownerProfileImage: null,
              },
            ],
          };
        else if (path === `/api/tynes/${MOCK_MODAL_PROPS.tyneId}/share`)
          return {
            shares: [],
            users: [],
            published: false,
          };
        return {};
      },
    };
  };
});

const ModalContextPortal = React.forwardRef<ModalDispatch, {}>((props, ref) => {
  const modalDispatch = useModalDispatch();

  useEffect(() => {
    if (typeof ref === "function") ref(modalDispatch);
    else if ("current" in ref!) ref.current = modalDispatch;
  }, [ref, modalDispatch]);

  return null;
});

describe("NeptyneModals", () => {
  describe.each([
    [
      "ref",
      (ref: MutableRefObject<ModalDispatch | null>) => (
        <NeptyneModals ref={ref} {...MOCK_MODAL_PROPS} />
      ),
    ],
    [
      "context",
      (ref: MutableRefObject<ModalDispatch | null>) => (
        <NeptyneModals {...MOCK_MODAL_PROPS}>
          <ModalContextPortal ref={ref} />
        </NeptyneModals>
      ),
    ],
  ])("NeptyneModals open via %s", (_, modalContextRenderer) => {
    it.each(TESTED_MODALS)("Opens %p", async (Modal, waitFor) => {
      const modalDispatch: MutableRefObject<null | ModalDispatch> = { current: null };
      render(
        (
          modalContextRenderer as (
            ref: MutableRefObject<ModalDispatch | null>
          ) => ReactElement
        )(modalDispatch)
      );

      expect(typeof modalDispatch.current).toBe("function");
      // Haven't found better generic solution yet
      expect(document.querySelector(".MuiModal-root")).toBeNull();

      await act(async () => {
        modalDispatch.current?.({
          action: ModalReducerAction.Show,
          props: {
            element: Modal as typeof LinkDialog,
          },
        });
      });
      await waitFor?.();

      expect(document.querySelector(".MuiModal-root")).toBeInstanceOf(HTMLElement);

      await act(() => {
        modalDispatch.current?.({
          action: ModalReducerAction.Hide,
        });
      });

      expect(document.querySelector(".MuiModal-root")).toBeNull();
    });
  });

  describe.each([
    [
      "backdrop click",
      async () =>
        await userEvent.click(document.querySelector(".MuiDialog-container")!),
    ],
    [
      "esc press",
      async () =>
        await userEvent.type(document.querySelector(".MuiDialog-container")!, "{esc}"),
    ],
  ])("NeptyneModals close via %s", (_, handleClose) => {
    it.each(TESTED_MODALS)("Closes %p", async (Modal, waitFor) => {
      const modalDispatch: MutableRefObject<null | ModalDispatch> = { current: null };
      render(<NeptyneModals ref={modalDispatch} {...MOCK_MODAL_PROPS} />);
      await act(() => {
        modalDispatch.current?.({
          action: ModalReducerAction.Show,
          props: {
            element: Modal as typeof LinkDialog,
          },
        });
      });
      await waitFor?.();

      expect(document.querySelector(".MuiModal-root")).toBeInstanceOf(HTMLElement);

      await act(async () => {
        await (handleClose as () => void)();
      });

      expect(document.querySelector(".MuiModal-root")).toBeNull();
    });
  });
});
