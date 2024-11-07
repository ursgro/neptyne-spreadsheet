import React, {
  createContext,
  Dispatch,
  forwardRef,
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import isPlainObject from "lodash/isPlainObject";
import { LinkDialog, LinkDialogProps } from "../components/ToolbarControls/LinkDialog";
import { NoteDialog, NoteDialogProps } from "../components/ToolbarControls/NoteDialog";
import {
  OpenTyneDialogDataWrapper,
  OpenTyneDialogDataWrapperProps,
} from "../components/OpenDialog/OpenTyneDialogDataWrapper";
import {
  ShareDialogDataWrapperProps,
  ShareDialogDataWrapper,
} from "../ShareDialog/ShareDialogDataWrapper";
import {
  WidgetDialogDataWrapper,
  WidgetDialogDataWrapperProps,
} from "../components/ToolbarControls/Widgets/WidgetDialogDataWrapper";
import { ShortcutModal, ShortcutModalProps } from "../ShortcutModal/ShortcutModal";

type NeptyneModalsChildrenProps = Omit<
  LinkDialogProps &
    NoteDialogProps &
    OpenTyneDialogDataWrapperProps &
    ShareDialogDataWrapperProps &
    Omit<ShortcutModalProps, "shortcutItems"> &
    Omit<WidgetDialogDataWrapperProps, "type" | "data">,
  "onClose"
>;

export interface NeptyneModalsProps extends NeptyneModalsChildrenProps {
  onToggle: (isOpen: boolean) => void;
}

export enum ModalReducerAction {
  Show,
  Hide,
}

export type ModalReducerShowProps =
  | {
      element: typeof LinkDialog;
      elementProps?: Partial<Omit<LinkDialogProps, "onClose">>;
    }
  | {
      element: typeof NoteDialog;
      elementProps?: Partial<Omit<NoteDialogProps, "onClose">>;
    }
  | {
      element: typeof OpenTyneDialogDataWrapper;
      elementProps?: Partial<Omit<OpenTyneDialogDataWrapperProps, "onClose">>;
    }
  | {
      element: typeof ShareDialogDataWrapper;
      elementProps?: Partial<Omit<ShareDialogDataWrapperProps, "onClose">>;
    }
  | {
      element: typeof WidgetDialogDataWrapper;
      elementProps: Required<Pick<WidgetDialogDataWrapperProps, "type">> &
        Pick<WidgetDialogDataWrapperProps, "data" | "sheetSelection">;
    }
  | {
      element: typeof ShortcutModal;
      elementProps: Omit<ShortcutModalProps, "onClose">;
    };

type ModalReducerProps =
  | {
      action: ModalReducerAction.Show;
      props: ModalReducerShowProps;
    }
  | { action: ModalReducerAction.Hide };

type ModalState =
  | {
      isOpen: true;
      ModalElement: ModalReducerShowProps["element"];
      modalProps?: ModalReducerShowProps["elementProps"];
    }
  | {
      isOpen: false;
    };

function modalReducer(state: ModalState, payload: ModalReducerProps): ModalState {
  if (payload.action === ModalReducerAction.Show) {
    return {
      isOpen: true,
      ModalElement: payload.props.element,
      modalProps: payload.props.elementProps,
    };
  } else if (payload.action === ModalReducerAction.Hide) {
    return { isOpen: false };
  }

  throw new Error(`ModalContext dispatch got invalid payload.`);
}

export type ModalDispatch = Dispatch<ModalReducerProps>;

export const ModalContext = createContext<ModalDispatch | null>(null);

export const NeptyneModals = forwardRef<
  ModalDispatch,
  PropsWithChildren<NeptyneModalsProps>
>(({ children, onToggle, ...rest }, ref) => {
  const [modalState, modalStateDispatch] = useReducer<typeof modalReducer, ModalState>(
    modalReducer,
    { isOpen: false },
    () => ({ isOpen: false })
  );

  const handleClose = useCallback(() => {
    onToggle(false);
    modalStateDispatch({ action: ModalReducerAction.Hide });
  }, [onToggle]);

  const handleModalStateDispatch = useCallback(
    (value: ModalReducerProps) => {
      onToggle(value.action === ModalReducerAction.Show);
      return modalStateDispatch(value);
    },
    [onToggle]
  );

  useEffect(() => {
    if (typeof ref === "function") ref(handleModalStateDispatch);
    else if (isPlainObject(ref))
      (ref as MutableRefObject<ModalDispatch>).current = handleModalStateDispatch;
  }, [handleModalStateDispatch, ref]);

  return (
    <>
      {modalState.isOpen && (
        <div onPaste={stopPastePropagation}>
          <modalState.ModalElement
            {...rest}
            {...modalState.modalProps}
            onClose={handleClose}
          ></modalState.ModalElement>
        </div>
      )}
      <ModalContext.Provider value={handleModalStateDispatch}>
        {children}
      </ModalContext.Provider>
    </>
  );
});

const stopPastePropagation: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
  e.stopPropagation();
};

export const useModalDispatch = (): Dispatch<ModalReducerProps> => {
  const modalDispatch = useContext(ModalContext);

  if (modalDispatch === null) {
    throw new Error("useModalDispatch must be used within ModalContext");
  }

  return modalDispatch;
};
