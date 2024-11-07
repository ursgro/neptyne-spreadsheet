import {
  FocusEventHandler,
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import Divider from "@mui/material/Divider";
import { CellAttributes, GridElement, TyneAction } from "./SheetUtils";
import { UndoRedoQueue } from "./UndoRedo";
import {
  AccessMode,
  CellAttribute,
  LineWrap,
  LineWrapDefault,
  Secrets,
  WidgetRegistry,
} from "./NeptyneProtocol";
import { AdaptiveToolbar } from "./components/ToolbarControls/AdaptiveToolbar/AdaptiveToolbar";
import { TextAlignControl } from "./components/ToolbarControls/TextAlignControl";
import { LinkControl } from "./components/ToolbarControls/LinkControl";
import { ToolbarIconButton } from "./components/ToolbarControls/ToolbarIconButton";
import { ReactComponent as UndoIcon } from "./icons/undo.svg";
import { ReactComponent as RedoIcon } from "./icons/redo.svg";
import { NeptyneIconButtonGroup } from "./components/NeptyneIconButtonGroup";
import { NumberFormatControl } from "./components/ToolbarControls/NumberFormatControl";
import { StyleControl } from "./components/ToolbarControls/StyleControl";
import { BorderControl } from "./components/ToolbarControls/BorderControl";
import { WidgetControl } from "./components/ToolbarControls/Widgets/WidgetControl";
import { CodeEditorControl } from "./components/ToolbarControls/CodeEditorcontrol";
import { SheetAttributes } from "./neptyne-container/NeptyneContainer";
import { Box, Stack } from "@mui/material";
import { NeptyneActionMenu } from "./neptyne-container/NeptyneActionMenu";
import { StreamHandler } from "./KernelSession";
import { TyneRenameInput } from "./components/TyneRenameInput";
import { GoogleDriveDoc } from "./google-drive";
import { isDesktop } from "react-device-detect";
import { HelpControl } from "./components/ToolbarControls/HelpControl";
import { WrapControl } from "./components/ToolbarControls/WrapControl";
import { LastSavedIndicator } from "./neptyne-container/LastSaveIndicator";
import { TOOLBAR_APPMODE_SX, TOOLBAR_SX } from "./ToolbarsStyle";
import { useAccessMode } from "./access-mode";
import { User } from "./user-context";

interface SheetToolbarProps {
  statusIcon: JSX.Element;
  statusText: string | null;
  tyneId: string;
  showCopyPrompt: boolean;
  canInterrupt: boolean;
  tyneName: string;
  snackErrorMessage: string | null;
  showReadonlyScreen: boolean;
  handleReadonlyScreenClose: () => void;

  // props for name input
  onNameFocus: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onRenameTyne: (newName: string) => void;

  requirements: string;
  onInstallRequirements: (requirements?: string, onStream?: StreamHandler) => void;
  showRequirements: boolean;
  curCellAttributes: CellAttributes;
  curCellValue: GridElement["value"];
  sheetAttributes: SheetAttributes;
  onUpdateCellBorders: (cellAttribute: CellAttribute, attributeValue: string) => void;
  onSheetAttributeChange: (name: string, newValue: any | undefined) => void;
  readOnly: boolean;
  undoRedo: UndoRedoQueue;
  user: User | null;
  widgetRegistry: WidgetRegistry;
  isCopyingFormat: boolean;
  onSelectionAttributeChange: (
    attributeName: CellAttribute,
    value: string | undefined
  ) => void;
  codeEditorVisible: boolean;
  setCodeEditorVisible: (visible: boolean) => void;
  onTyneAction: (
    tyneAction: TyneAction,
    payload?: string | File | GoogleDriveDoc
  ) => void;
  onDeleteTyne: () => void;
  onSave: () => void;
  onDownload: (fmt: string) => void;
  onImportCsv: () => void;
  onDismissAlert: () => void;
  onInterrupt: () => void;
  onOpenResearchPanel: () => void;
  onWidgetControlSelect: (format: string) => void;
  onClearFormatting: () => void;
  onCopyFormatToggle: () => void;
  setSecrets: (user: Secrets, tyne: Secrets) => void;
  lastSave?: Date | null;
  reconnectKernel: (name: string) => void;
  embeddedNotebookMode: boolean;
}

export interface SheetToolbarApi {
  openFontSelect: () => void;
  openFontColorSelect: () => void;
  openBackgroundColorSelect: () => void;
}

export const SheetToolbar = memo(
  forwardRef<SheetToolbarApi, SheetToolbarProps>(
    (
      {
        curCellAttributes,
        curCellValue,
        user,
        statusIcon,
        statusText,
        tyneId,
        tyneName,
        showCopyPrompt,
        canInterrupt,
        showRequirements,
        requirements,
        readOnly,
        undoRedo,
        snackErrorMessage,
        showReadonlyScreen,
        isCopyingFormat,
        handleReadonlyScreenClose,
        onDismissAlert,
        onRenameTyne,
        onDeleteTyne,
        onSave,
        onDownload,
        onImportCsv,
        onInterrupt,
        onOpenResearchPanel,
        onTyneAction,
        onNameFocus,
        onInstallRequirements,
        sheetAttributes,
        onSelectionAttributeChange,
        onClearFormatting,
        onUpdateCellBorders,
        onSheetAttributeChange,
        codeEditorVisible,
        setCodeEditorVisible,
        widgetRegistry,
        onWidgetControlSelect,
        onCopyFormatToggle,
        setSecrets,
        lastSave,
        reconnectKernel,
        embeddedNotebookMode,
      },
      ref
    ) => {
      const accessMode = useAccessMode();
      const appMode = accessMode === AccessMode.App;

      const renameInput = useRef<HTMLInputElement | null>(null);

      const handleSelectionAttributeChange = useCallback(
        (attributeName: CellAttribute, value: string | undefined) => {
          if (isCopyingFormat) {
            onCopyFormatToggle();
          }
          onSelectionAttributeChange(attributeName, value);
        },
        [isCopyingFormat, onCopyFormatToggle, onSelectionAttributeChange]
      );

      const handleCodeEditorControlClick = useCallback(
        () => setCodeEditorVisible(!codeEditorVisible),
        [setCodeEditorVisible, codeEditorVisible]
      );

      const handleTyneRename = useCallback(() => {
        renameInput.current?.focus();
      }, []);

      // This hook allows opening and closing toolbar elements on demand. It is very
      // unconventional from the React perspective, but conventional way seemed to verbose and
      // bloated Toolbar and its children.
      //
      // Basically what happens in each of the handlers below: we find and open toolbar submenu,
      // then open a specific control inside this submenu, let user interact with it, and then
      // close it. We have to address "more" button too.
      useImperativeHandle(ref, () => ({
        openFontSelect: () => {
          document.getElementById("more-button")?.click();
          // element appears with an animation, so clicking it as soon as it appears places dropdown in a wrong place
          onElementMount("#toolbar-style-button", 100).then((element) => {
            element.click();
            onElementMount("#font-select", 100).then((element) => {
              let clickEvent = document.createEvent("MouseEvents");
              clickEvent.initEvent("mousedown", true, true);
              element?.dispatchEvent(clickEvent);

              onElementMount("#font-select-menu").then((menuElement) => {
                onElementUnmount(menuElement).then(() => {
                  document.getElementById("toolbar-style")?.click();
                  document
                    .getElementById("more-button-popover")
                    ?.querySelector<HTMLElement>(".MuiBackdrop-root")
                    ?.click();
                });
              });
            });
          });
        },
        openFontColorSelect: () => {
          document.getElementById("more-button")?.click();

          onElementMount("#toolbar-style-button", 100).then((element) => {
            element.click();

            onElementMount("#toolbar-font-color-button", 100).then((element) => {
              onElementUnmount(element).then(() => {
                document
                  .getElementById("more-button-popover")
                  ?.querySelector<HTMLElement>(".MuiBackdrop-root")
                  ?.click();
              });
              element?.click();
            });
          });
        },
        openBackgroundColorSelect: () => {
          document.getElementById("more-button")?.click();

          onElementMount("#toolbar-style-button", 100).then((element) => {
            element.click();

            onElementMount("#toolbar-background-color-button", 100).then((element) => {
              onElementUnmount(element).then(() => {
                document
                  .getElementById("more-button-popover")
                  ?.querySelector<HTMLElement>(".MuiBackdrop-root")
                  ?.click();
              });
              element?.click();
            });
          });
        },
      }));
      return (
        <Box sx={appMode ? TOOLBAR_APPMODE_SX : TOOLBAR_SX}>
          {!embeddedNotebookMode && (
            <NeptyneActionMenu
              statusIcon={statusIcon}
              statusText={statusText}
              user={user}
              tyneId={tyneId}
              readOnly={readOnly || accessMode === AccessMode.App}
              tyneName={tyneName}
              snackErrorMessage={snackErrorMessage}
              showReadonlyScreen={showReadonlyScreen}
              handleReadonlyScreenClose={handleReadonlyScreenClose}
              onDismissAlert={onDismissAlert}
              onTyneAction={onTyneAction}
              onDeleteTyne={onDeleteTyne}
              onSave={onSave}
              onDownload={onDownload}
              onImportCsv={onImportCsv}
              onTyneRenameInitialization={handleTyneRename}
              showCopyPrompt={showCopyPrompt}
              canInterrupt={canInterrupt}
              onInterrupt={onInterrupt}
              onOpenResearchPanel={onOpenResearchPanel}
              requirements={requirements}
              onInstallRequirements={onInstallRequirements}
              showRequirements={showRequirements}
              setSecrets={setSecrets}
              reconnectKernel={reconnectKernel}
            />
          )}
          {!embeddedNotebookMode && isDesktop && (
            <Stack
              style={
                appMode
                  ? {
                      minWidth: "0px",
                    }
                  : {
                      transform: "translateY(20%)",
                    }
              }
            >
              {appMode ? (
                <Box
                  sx={{ fontWeight: "primary.main" }}
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  minWidth={0}
                >
                  {tyneName}
                </Box>
              ) : (
                <TyneRenameInput
                  ref={renameInput}
                  initialValue={tyneName}
                  onFocus={onNameFocus}
                  onRename={onRenameTyne}
                  readOnly={readOnly}
                  data-testid={"tyne-rename-input"}
                />
              )}
              {!appMode && (
                <div style={{ height: "15px" }}>
                  {lastSave !== undefined && (
                    <LastSavedIndicator
                      lastSave={lastSave}
                      fontSize={10}
                      marginLeft="4px"
                      color="text.secondary"
                    />
                  )}
                </div>
              )}
            </Stack>
          )}

          <AdaptiveToolbar>
            {!appMode && (
              <>
                <NeptyneIconButtonGroup>
                  <ToolbarIconButton
                    testId="UndoIcon"
                    onClick={undoRedo.undo}
                    icon={UndoIcon}
                    isDisabled={readOnly || !undoRedo.canUndo()}
                  />
                  <ToolbarIconButton
                    testId="RedoIcon"
                    onClick={undoRedo.redo}
                    icon={RedoIcon}
                    isDisabled={readOnly || !undoRedo.canRedo()}
                  />
                </NeptyneIconButtonGroup>
                <Divider orientation="vertical" flexItem />
                <StyleControl
                  cellAttributes={curCellAttributes}
                  onSelectionAttributeChange={handleSelectionAttributeChange}
                  onClearFormatting={onClearFormatting}
                  isDisabled={readOnly}
                  isCopyingFormat={isCopyingFormat}
                  onCopyFormatToggle={onCopyFormatToggle}
                />
                <TextAlignControl
                  isDisabled={readOnly}
                  cellAttributes={curCellAttributes}
                  currentCellValue={curCellValue}
                  onSelectionAttributeChange={handleSelectionAttributeChange}
                />
                <BorderControl
                  areGridlinesHidden={sheetAttributes.areGridlinesHidden}
                  isDisabled={readOnly}
                  onUpdateCellBorders={onUpdateCellBorders}
                  onSheetAttributeChange={onSheetAttributeChange}
                />
                <WrapControl
                  activeOption={
                    (curCellAttributes[CellAttribute.LineWrap] ||
                      LineWrapDefault) as LineWrap
                  }
                  isDisabled={readOnly}
                  onSelectionAttributeChange={handleSelectionAttributeChange}
                />
                <NumberFormatControl
                  isDisabled={readOnly}
                  cellAttributes={curCellAttributes}
                  cellValue={curCellValue}
                  onSelectionAttributeChange={handleSelectionAttributeChange}
                />
                <Divider orientation="vertical" flexItem />
                <LinkControl
                  isActive={Boolean(curCellAttributes[CellAttribute.Link])}
                  isDisabled={readOnly}
                />
                <Divider orientation="vertical" flexItem />
                <WidgetControl
                  widgetRegistry={widgetRegistry}
                  onSelect={onWidgetControlSelect}
                  isDisabled={readOnly}
                  widgetType="Input"
                />
                <WidgetControl
                  widgetRegistry={widgetRegistry}
                  onSelect={onWidgetControlSelect}
                  isDisabled={readOnly}
                  widgetType="Output"
                />
              </>
            )}
          </AdaptiveToolbar>
          {!embeddedNotebookMode && !appMode && (
            <CodeEditorControl
              isActive={codeEditorVisible}
              onClick={handleCodeEditorControlClick}
            />
          )}

          {isDesktop && user && (
            <Box flexGrow={0}>
              <HelpControl />
            </Box>
          )}
        </Box>
      );
    }
  )
);

/**
 * Waits for an element with provided selector, resolves promise when this element mounts.
 *
 * Optional timeout allows to resolve promise with a slight delay, because some elements have
 * animation on mount, and we have to wait it out.
 *
 * https://stackoverflow.com/questions/5525071/how-to-wait-until-an-element-exists
 */
const onElementMount = (selector: string, timeout: number = 0): Promise<HTMLElement> =>
  new Promise((resolve) => {
    const element = document.querySelector(selector) as HTMLElement;
    if (element && !timeout) {
      return resolve(element);
    } else if (element) {
      return setTimeout(() => resolve(element), timeout);
    }

    const observer = new MutationObserver((mutations) => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element && !timeout) {
        resolve(element);
        observer.disconnect();
      } else if (element) {
        return setTimeout(() => resolve(element), timeout);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

/**
 * Wait for a provided element to unmount from DOM. Resolves promise when this happen.
 */
const onElementUnmount = (element: HTMLElement): Promise<void> =>
  new Promise((resolve) => {
    if (!document.body.contains(element)) {
      return resolve();
    }

    const observer = new MutationObserver(function (mutations) {
      if (!document.body.contains(element)) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
