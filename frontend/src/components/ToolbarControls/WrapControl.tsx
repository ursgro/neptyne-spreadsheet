import { FunctionComponent, useCallback } from "react";
import { CellAttribute, LineWrap } from "../../NeptyneProtocol";
import WrapTextIcon from "@mui/icons-material/WrapText";
import KeyboardTabIcon from "@mui/icons-material/KeyboardTab";
import Start from "@mui/icons-material/Start";
import { ButtonWithPopover, PopoverContainer } from "../ButtonWithPopover";
import { ToolbarIconButton } from "./ToolbarIconButton";

export interface WrapControlProps {
  isDisabled: boolean;
  activeOption: LineWrap;
  onSelectionAttributeChange: (
    attributeName: CellAttribute,
    value: string | undefined
  ) => void;
}

const SIZE = 18;

export const WrapControl: FunctionComponent<WrapControlProps> = ({
  isDisabled,
  activeOption,
  onSelectionAttributeChange,
}) => {
  return (
    <ButtonWithPopover
      popoverId="WrapPopover"
      testId="WrapButton"
      closeOnClick
      popoverContent={
        <PopoverContainer>
          <ToolbarIconButton
            isActive={activeOption === LineWrap.Truncate}
            testId={`wrap-control-${LineWrap.Truncate}`}
            tooltip="Truncate"
            icon={ICON_MAP[LineWrap.Truncate]}
            onClick={useCallback(
              () =>
                onSelectionAttributeChange(CellAttribute.LineWrap, LineWrap.Truncate),
              [onSelectionAttributeChange]
            )}
            size={SIZE}
          />
          <ToolbarIconButton
            isActive={activeOption === LineWrap.Wrap}
            testId={`wrap-control-${LineWrap.Wrap}`}
            tooltip="Wrap"
            icon={ICON_MAP[LineWrap.Wrap]}
            onClick={useCallback(
              () => onSelectionAttributeChange(CellAttribute.LineWrap, LineWrap.Wrap),
              [onSelectionAttributeChange]
            )}
            size={SIZE}
          />
          <ToolbarIconButton
            isActive={activeOption === LineWrap.Overflow}
            testId={`wrap-control-${LineWrap.Overflow}`}
            tooltip="Overflow"
            icon={ICON_MAP[LineWrap.Overflow]}
            onClick={useCallback(
              () =>
                onSelectionAttributeChange(CellAttribute.LineWrap, LineWrap.Overflow),
              [onSelectionAttributeChange]
            )}
            size={SIZE}
          />
        </PopoverContainer>
      }
      icon={ICON_MAP[activeOption]}
      isDisabled={isDisabled}
      hasArrow
    >
      Wrapping
    </ButtonWithPopover>
  );
};

const ICON_MAP: Record<LineWrap, FunctionComponent> = {
  [LineWrap.Wrap]: WrapTextIcon,
  [LineWrap.Overflow]: Start,
  [LineWrap.Truncate]: KeyboardTabIcon,
};
