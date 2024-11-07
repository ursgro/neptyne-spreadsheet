import { createKeybindingsHandler } from "tinykeys";
import { Box } from "@mui/material";
import {
  FunctionComponent,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import escapeRegExp from "lodash/escapeRegExp";
import { isMacOs } from "react-device-detect";
import sortBy from "lodash/sortBy";
import {
  ShortcutModalBackdrop,
  ShortcutModalBody,
  SearchBox,
  SearchInput,
  SearchResultBox,
  ItemsListBox,
  ItemBox,
  ShortcutBox,
} from "./StyledComponents";

interface ShortcutItem {
  name: string;
  shortcut: string;
  callback: (event: KeyboardEvent) => void;
}

export interface ShortcutModalProps {
  shortcutItems?: ShortcutItem[];
  startHotkeySearchQuery?: string;
  startSearchQuery?: string;
  onClose: () => void;
}

export const ShortcutModal: FunctionComponent<ShortcutModalProps> = memo(
  ({
    shortcutItems: propShortcutItems,
    startHotkeySearchQuery = "",
    startSearchQuery = "",
    onClose,
  }) => {
    const [searchQuery, setSearchQuery] = useState(startSearchQuery);

    const [hotkeySearchQuery, setHotkeySearchQuery] = useState(
      `${START_SHORTCUT_PREFIX}${startHotkeySearchQuery}`
    );

    const shortcutItems = useShortcutItems(
      searchQuery,
      hotkeySearchQuery,
      propShortcutItems || []
    );

    const [activeItem, setActiveItem] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const handleClose = useCallback(() => {
      onClose();
      document.getElementById("data-grid-container")?.focus();
    }, [onClose]);

    useEffect(() => {
      const { current: searchInputElement } = searchInputRef;

      if (searchInputElement) {
        const eventListener = createKeybindingsHandler({
          ArrowDown: () =>
            setActiveItem((prevActiveItem) =>
              prevActiveItem + 1 < shortcutItems.length ? prevActiveItem + 1 : 0
            ),
          ArrowUp: () =>
            setActiveItem((prevActiveItem) =>
              prevActiveItem > 0 ? prevActiveItem - 1 : shortcutItems.length - 1
            ),
          Enter: (e) => {
            shortcutItems[activeItem]?.callback(e);
            handleClose();
          },
          Escape: handleClose,
        });

        searchInputElement.addEventListener("keydown", eventListener);

        return () => searchInputElement.removeEventListener("keydown", eventListener);
      }
    }, [activeItem, shortcutItems, handleClose]);

    useScrollIntoView(activeItem);

    return (
      <ShortcutModalBackdrop open onClick={handleClose}>
        <ShortcutModalBody
          data-testid="shortcut-modal"
          display="flex"
          flexDirection="column"
          gap="10px"
          onClick={(e) => {
            e.stopPropagation();

            // lots of things rely on search input being in focus. So we make sure it always is.
            searchInputRef.current?.click();
          }}
        >
          <SearchBox display="flex" flexDirection="column" gap="10px">
            <SearchInput
              id="shortcut-modal-search"
              data-testid="shortcut-modal-search"
              ref={searchInputRef}
              type="text"
              role="search"
              placeholder="🔍 Enter your shortcut combination or exact match"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                const hotkeySearchQueryArr = hotkeySearchQuery.split("+");
                if (e.code === "Backspace") {
                  if (hotkeySearchQueryArr.length > 2) {
                    hotkeySearchQueryArr.pop();
                    setHotkeySearchQuery(hotkeySearchQueryArr.join("+"));
                  }
                } else if (!HOTKEY_BLACKLIST.includes(e.code)) {
                  setHotkeySearchQuery(hotkeySearchQueryArr.concat(e.code).join("+"));
                }
              }}
            />
          </SearchBox>
          <SearchResultBox
            display="flex"
            flexDirection="column"
            gap="10px"
            maxHeight="50vh"
          >
            <Box
              display="flex"
              flexDirection="row"
              justifyContent="space-between"
              color="grey.500"
              padding="10px"
            >
              <Box>Function</Box>
              <Box>Shortcut</Box>
            </Box>
            <ItemsListBox display="flex" flexDirection="column" gap="10px">
              {shortcutItems.map((item, idx) => (
                <ShortcutItemView
                  key={item.shortcut}
                  name={
                    <>
                      <Highlighted text={item.name} highlight={searchQuery} />
                    </>
                  }
                  shortcut={
                    <Highlighted
                      text={shortcutToRepr(trimKeycodes(item.shortcut))}
                      highlight={
                        hotkeySearchQuery === START_SHORTCUT_PREFIX
                          ? ""
                          : shortcutToRepr(trimKeycodes(hotkeySearchQuery))
                      }
                    />
                  }
                  callback={(e) => {
                    item.callback(e);
                    handleClose();
                  }}
                  isActive={activeItem === idx}
                />
              ))}
            </ItemsListBox>
          </SearchResultBox>
        </ShortcutModalBody>
      </ShortcutModalBackdrop>
    );
  }
);

const useShortcutItems = (
  searchQuery: string,
  hotkeySearchQuery: string,
  propShortcutItems: readonly ShortcutItem[]
) =>
  useMemo(
    () =>
      sortBy(
        propShortcutItems.filter(
          ({ name, shortcut }) =>
            name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            shortcutToRepr(shortcut).includes(hotkeySearchQuery)
        ),
        [(row) => !shortcutToRepr(row.shortcut).includes(hotkeySearchQuery), "name"]
      ),
    [searchQuery, hotkeySearchQuery, propShortcutItems]
  );

const useScrollIntoView = (activeItem: number) =>
  useEffect(
    () =>
      document
        .getElementById("shortcut-item-active")
        ?.scrollIntoView({ block: "nearest" }),
    [activeItem]
  );
interface ShortcutItemViewProps {
  callback: (e: KeyboardEvent) => void;
  name: ReactNode;
  shortcut: ReactNode;
  isActive: boolean;
}

const ShortcutItemView: FunctionComponent<ShortcutItemViewProps> = ({
  name,
  shortcut,
  isActive,
}) => (
  <ItemBox
    display="flex"
    flexDirection="row"
    justifyContent="space-between"
    onClick={() =>
      document.getElementById("shortcut-modal-search")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          charCode: 0,
          code: "Enter",
          composed: true,
          ctrlKey: false,
          detail: 0,
          key: "Enter",
          keyCode: 13,
          location: 0,
          metaKey: false,
          repeat: false,
          which: 13,
        })
      )
    }
    fontWeight="600"
    alignItems="center"
    id={isActive ? "shortcut-item-active" : undefined}
    className={isActive ? "shortcut-item-active" : undefined}
  >
    <Box>{name}</Box>
    <ShortcutBox>{shortcut}</ShortcutBox>
  </ItemBox>
);

const trimKeycodes = (shortcut: string): string =>
  shortcut.replaceAll(/(Key)|(Digit)/g, "");

const shortcutToRepr = (shortcut: string): string =>
  shortcut.replace(/ /g, "+").replace(/\$mod/g, isMacOs ? "Commad" : "Control");

export const HOTKEY_BLACKLIST = [
  "Tab",
  "ControlLeft",
  "MetaLeft",
  "AltLeft",
  "ShiftLeft",
  "ControlRight",
  "MetaRight",
  "AltRight",
  "ShiftRight",
  "Enter",
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
];

const START_SHORTCUT_PREFIX = "Alt+KeyH";

const Highlighted = memo(
  ({ text = "", highlight = "" }: { text: string; highlight: string }) => {
    if (!highlight.trim()) {
      return <>{text}</>;
    }
    const regex = new RegExp(`(${escapeRegExp(highlight)})`, "gi");
    const parts = text.split(regex);
    return (
      <>
        {parts
          .filter((part) => part)
          .map((part, i) =>
            regex.test(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
          )}
      </>
    );
  }
);
