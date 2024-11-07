import { FunctionComponent, useCallback, useState } from "react";
import { ButtonWithPopover, PopoverContainer } from "../ButtonWithPopover";
import { CellAttributes, ALLOWED_FONTS } from "../../SheetUtils";
import {
  BgColorDefault,
  CellAttribute,
  TextColorDefault,
  TextStyle,
} from "../../NeptyneProtocol";
import { ToolbarIconButton } from "./ToolbarIconButton";
import { ReactComponent as BoldIcon } from "../../icons/bold.svg";
import { ReactComponent as ItalicIcon } from "../../icons/italic.svg";
import { ReactComponent as UnderlineIcon } from "../../icons/underline.svg";
import { ReactComponent as TextColorIcon } from "../../icons/textColor.svg";
import { ReactComponent as FillColorIcon } from "../../icons/fillColor.svg";
import { hotKeys } from "../../hotkeyConstants";
import { ColorPickerIconButton } from "./ColorPickerIconButton";
import { alpha, Box, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { DEFAULT_FONT_SIZE, FontSizeSelect } from "./FontSizeSelect";
import FormatPaintIcon from "@mui/icons-material/FormatPaintOutlined";
import { FontSelect } from "./FontSelect";

export interface StyleControlProps {
  cellAttributes: CellAttributes;
  isDisabled: boolean;
  isCopyingFormat: boolean;
  onSelectionAttributeChange: (
    attributeName: CellAttribute,
    value: string | undefined
  ) => void;
  onClearFormatting: () => void;
  onCopyFormatToggle: () => void;
}

const buttons = [
  {
    tooltip: "Bold",
    icon: BoldIcon,
    value: TextStyle.Bold,
    hotKey: hotKeys.bold,
    testId: "StyleBoldButton",
  },
  {
    tooltip: "Italic",
    icon: ItalicIcon,
    value: TextStyle.Italic,
    hotKey: hotKeys.italic,
    testId: "StyleItalicButton",
  },
  {
    tooltip: "Underline",
    icon: UnderlineIcon,
    value: TextStyle.Underline,
    hotKey: hotKeys.underline,
    testId: "StyleUnderlineButton",
  },
];

const CLEAR_FORMATTING_WRAPPER_STYLES = { width: "100%", marginTop: "3px" };

const getClearFormattingSX = (theme: Theme): SystemStyleObject => ({
  ...theme.typography.button,
  alignItems: "center",
  border: "1px solid transparent",
  borderRadius: "5px",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-around",
  margin: "0 1px",
  padding: "0 4px 0 8px",
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionTimingFunction: theme.transitions.easing.easeOut,
  transitionProperty: "color, background-color, border-color",
  "&:hover": {
    backgroundColor: alpha(theme.palette.secondary.main, 0.11),
  },
  ".MuiCheckbox-root": {
    padding: "4px",
    ".MuiSvgIcon-root": {
      fontSize: "inherit",
    },
  },
  borderColor: theme.palette.secondary.lightBorder,
  color: theme.palette.secondary.main,
});

export const StyleControl: FunctionComponent<StyleControlProps> = ({
  cellAttributes,
  isDisabled,
  isCopyingFormat,
  onSelectionAttributeChange,
  onClearFormatting,
  onCopyFormatToggle,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const buttonHandlers = buttons.map((button) =>
    // Incorrectly thinks that hook is defined inside another hook,
    // while we're just iterating through two constants, which is fine.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useCallback(() => {
      onSelectionAttributeChange(CellAttribute.TextStyle, button.value);
      // Cause of issue above thinks that button is a prop, while it isn't.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onSelectionAttributeChange])
  );

  const handleTextColorSelect = useCallback(
    (value: any) => {
      onSelectionAttributeChange(CellAttribute.Color, value);
      setAnchorEl(null);
    },
    [onSelectionAttributeChange]
  );
  const handleBgColorSelect = useCallback(
    (value: any) => {
      onSelectionAttributeChange(CellAttribute.BgColor, value);
      setAnchorEl(null);
    },
    [onSelectionAttributeChange]
  );

  const handleFontSizeSelect = useCallback(
    (value: any) => onSelectionAttributeChange(CellAttribute.FontSize, value),
    [onSelectionAttributeChange]
  );

  const handleFontSelect = useCallback(
    (value: any) => onSelectionAttributeChange(CellAttribute.Font, value),
    [onSelectionAttributeChange]
  );

  const activeButtons = cellAttributes[CellAttribute.TextStyle]?.split(" ") ?? [];

  const textColor = cellAttributes[CellAttribute.Color] || TextColorDefault;
  const bgColor = cellAttributes[CellAttribute.BgColor] || BgColorDefault;
  const fontSize =
    parseInt(cellAttributes[CellAttribute.FontSize]) || DEFAULT_FONT_SIZE;

  const font = cellAttributes[CellAttribute.Font] || ALLOWED_FONTS[0].cssName;

  return (
    <ButtonWithPopover
      testId="ToolbarStyleButton"
      muiButtonProps={{ id: "toolbar-style-button" }}
      popoverId="toolbar-style"
      isDisabled={isDisabled}
      anchorEl={anchorEl}
      onAnchorElChange={(value) => setAnchorEl(value)}
      popoverContent={
        <div>
          <PopoverContainer>
            {buttons.map((button, index) => (
              <ToolbarIconButton
                key={button.value}
                onClick={buttonHandlers[index]}
                icon={button.icon}
                size={18}
                isActive={activeButtons.includes(button.value)}
                tooltip={button.tooltip}
                hotKey={button.hotKey}
                testId={button.testId}
              />
            ))}
            <ColorPickerIconButton
              key="textColor"
              onSelect={handleTextColorSelect}
              onCopyFormatToggle={() => isCopyingFormat && onCopyFormatToggle()}
              size={18}
              icon={TextColorIcon}
              value={textColor}
              muiButtonProps={{ id: "toolbar-font-color-button" }}
            />
            <ColorPickerIconButton
              key="fillColor"
              testId="style-control-fill-color-button"
              onSelect={handleBgColorSelect}
              onCopyFormatToggle={() => isCopyingFormat && onCopyFormatToggle()}
              size={18}
              icon={FillColorIcon}
              value={bgColor}
              muiButtonProps={{ id: "toolbar-background-color-button" }}
            />
            <ToolbarIconButton
              key="copyFormat"
              onClick={onCopyFormatToggle}
              icon={FormatPaintIcon}
              size={18}
              isActive={isCopyingFormat}
              isDisabled={isDisabled}
              testId="style-control-copy-format-button"
            />
          </PopoverContainer>
          <PopoverContainer>
            <FontSizeSelect
              key="fontSize"
              testId="style-control-font-size-select"
              onSelect={handleFontSizeSelect}
              value={fontSize}
            />
            <FontSelect
              key="font"
              testId="style-control-font-select"
              onSelect={handleFontSelect}
              value={font}
            />
          </PopoverContainer>
          <PopoverContainer>
            <div style={CLEAR_FORMATTING_WRAPPER_STYLES}>
              <Box
                component="label"
                data-testid="ClearFormattingLabel"
                sx={getClearFormattingSX}
                onClick={onClearFormatting}
              >
                Clear formatting
              </Box>
            </div>
          </PopoverContainer>
        </div>
      }
      icon={BoldIcon}
      hasArrow
    >
      Style
    </ButtonWithPopover>
  );
};
