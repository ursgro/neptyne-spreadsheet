import { IconButton, Theme } from "@mui/material";
import Box from "@mui/material/Box";
import { observer } from "mobx-react-lite";
import {
  ChangeEvent,
  ClipboardEventHandler,
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { ReactComponent as CloseIcon } from "../icons/close.svg";
import { useSheetSearchContext } from "../sheet-search/sheet-search.store";
import { GridElement } from "../SheetUtils";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";

const SEARCH_BOX_SX = (theme: Theme) => ({
  position: "absolute",
  right: "20px",
  top: "25px",
  zIndex: 20,
  backgroundColor: "background.default",
  padding: "5px",
  border: `1px solid ${theme.palette.grey[300]}`,
});

const INPUT_STYLE = { marginRight: "5px" };

const CLOSE_BUTTON_SX = {
  color: "grey.700",
  width: "15px",
  height: "15px",
  boxSizing: "content-box",
};

interface SheetSearchPanelProps {
  grid: GridElement[][];
  onNavigateToCoords: (row: number, col: number) => void;
}

export const SheetSearchPanel: FunctionComponent<SheetSearchPanelProps> = observer(
  ({ grid, onNavigateToCoords }) => {
    const sheetSearchStore = useSheetSearchContext();
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (inputRef.current) inputRef.current?.focus();
      sheetSearchStore.setSearchInputRef(inputRef);
    }, [sheetSearchStore]);

    useEffect(
      () => sheetSearchStore.setSearchQuery(sheetSearchStore.searchQuery, grid),
      [sheetSearchStore, grid]
    );

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        sheetSearchStore.setSearchQuery(e.target.value, grid);
        sheetSearchStore.currentPosition &&
          onNavigateToCoords(
            sheetSearchStore.currentPosition.row,
            sheetSearchStore.currentPosition.col
          );
      },
      [grid, sheetSearchStore, onNavigateToCoords]
    );

    const handleKeyDown = useCallback(
      (e: any) => {
        if (e.key === "Enter") {
          sheetSearchStore.setNextSelectedMatchIdx();
          sheetSearchStore.currentPosition &&
            onNavigateToCoords(
              sheetSearchStore.currentPosition.row,
              sheetSearchStore.currentPosition.col
            );
        }
      },
      [onNavigateToCoords, sheetSearchStore]
    );

    const handleClose = useCallback(
      () => sheetSearchStore.endSearch(),
      [sheetSearchStore]
    );

    const handleNextResult = useCallback(() => {
      sheetSearchStore.setNextSelectedMatchIdx();
      sheetSearchStore.currentPosition &&
        onNavigateToCoords(
          sheetSearchStore.currentPosition.row,
          sheetSearchStore.currentPosition.col
        );
    }, [onNavigateToCoords, sheetSearchStore]);

    const handlePrevResult = useCallback(() => {
      sheetSearchStore.setPrevSelectedMatchIdx();
      sheetSearchStore.currentPosition &&
        onNavigateToCoords(
          sheetSearchStore.currentPosition.row,
          sheetSearchStore.currentPosition.col
        );
    }, [onNavigateToCoords, sheetSearchStore]);

    return (
      <Box sx={SEARCH_BOX_SX}>
        <input
          data-testid="sheet-search-input"
          ref={inputRef}
          type="text"
          value={sheetSearchStore.searchQuery}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handleStopPastePropagation}
          style={INPUT_STYLE}
        />
        {!!sheetSearchStore.searchQuery && (
          <span>
            {sheetSearchStore.selectedMatchIdx !== null
              ? sheetSearchStore.selectedMatchIdx + 1
              : 0}{" "}
            of {sheetSearchStore.searchMatches.size}
          </span>
        )}
        <IconButton sx={CLOSE_BUTTON_SX} onClick={handlePrevResult}>
          <ArrowDropUpIcon />
        </IconButton>
        <IconButton sx={CLOSE_BUTTON_SX} onClick={handleNextResult}>
          <ArrowDropDownIcon />
        </IconButton>
        <IconButton sx={CLOSE_BUTTON_SX} onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </Box>
    );
  }
);

const handleStopPastePropagation: ClipboardEventHandler = (e) => e.stopPropagation();
