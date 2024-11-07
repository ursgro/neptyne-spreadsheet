import React, { ElementType, FunctionComponent, useCallback } from "react";
import startCase from "lodash/startCase";
import isNil from "lodash/isNil";

import { ButtonWithPopover, PopoverContainer } from "../ButtonWithPopover";
import {
  CellAttribute,
  TextAlign,
  TextAlignDefault,
  TextAlignNumber,
  VerticalAlign,
  VerticalAlignDefault,
} from "../../NeptyneProtocol";
import { CellAttributes, GridElement } from "../../SheetUtils";
import { ReactComponent as AlignLeftIcon } from "../../icons/alignLeft.svg";
import { ReactComponent as AlignCenterIcon } from "../../icons/alignCenter.svg";
import { ReactComponent as AlignRightIcon } from "../../icons/alignRight.svg";
import { ReactComponent as AlignTopIcon } from "../../icons/alignTop.svg";
import { ReactComponent as AlignMiddleIcon } from "../../icons/alignMiddle.svg";
import { ReactComponent as AlignBottomIcon } from "../../icons/alignBottom.svg";
import { ToolbarIconButton } from "./ToolbarIconButton";
import { Divider, styled } from "@mui/material";
import { joinArrayBy, splitIntoGroups } from "../../commonUtils";

export interface TextAlignControlProps {
  isDisabled: boolean;
  cellAttributes: CellAttributes;
  currentCellValue: GridElement["value"];
  onSelectionAttributeChange: (
    attributeName: CellAttribute,
    value: string | undefined
  ) => void;
}

// TODO: move to styled components dir/file
export const SecondaryDivider = styled(Divider)(({ theme, orientation }) => ({
  [orientation === "horizontal" ? "width" : "height"]: "100%",
  borderColor: theme.palette.secondary.lightBorder,
  margin: "5px 0",
}));

const ICON_SIZE = 18;

const COLS = 3;

const HORIZONTAL_ALIGN_ICONS = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
};

const VERTICAL_ALIGN_ICONS = {
  top: AlignTopIcon,
  middle: AlignMiddleIcon,
  bottom: AlignBottomIcon,
};

interface Button {
  value: string;
  attribute: CellAttribute;
  Icon: ElementType;
  isDefault: (value: GridElement["value"]) => boolean;
}

const BUTTONS: Button[] = [
  Object.values(TextAlign).map((textAlign) => ({
    value: textAlign,
    attribute: CellAttribute.TextAlign,
    Icon: HORIZONTAL_ALIGN_ICONS[textAlign],
    isDefault: (value: GridElement["value"]): boolean =>
      textAlign === (typeof value === "number" ? TextAlignNumber : TextAlignDefault),
  })),
  Object.values(VerticalAlign).map((verticalAlign) => ({
    value: verticalAlign,
    attribute: CellAttribute.VerticalAlign,
    Icon: VERTICAL_ALIGN_ICONS[verticalAlign],
    isDefault: () => verticalAlign === VerticalAlignDefault,
  })),
].flat(1);

export const TextAlignControl: FunctionComponent<TextAlignControlProps> = ({
  isDisabled,
  cellAttributes,
  currentCellValue,
  onSelectionAttributeChange,
}) => {
  const buttonHandlers = BUTTONS.map((button) =>
    // Incorrectly thinks that hook is defined inside another hook,
    // while we're just iterating through two constants, which is fine.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useCallback(() => {
      onSelectionAttributeChange(button.attribute, button.value);
      // Cause of issue above thinks that button is a prop, while it isn't.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onSelectionAttributeChange])
  );

  const renderedButtons = BUTTONS.map((button, index) => {
    const isButtonActive = isNil(cellAttributes[button.attribute])
      ? button.isDefault(currentCellValue)
      : cellAttributes[button.attribute] === button.value;
    return (
      <ToolbarIconButton
        key={button.value + button.attribute}
        tooltip={startCase(button.value)}
        icon={button.Icon}
        onClick={buttonHandlers[index]}
        isActive={isButtonActive}
        size={ICON_SIZE}
      />
    );
  });

  return (
    <ButtonWithPopover
      isDisabled={isDisabled}
      popoverId="text-align-toolbar"
      icon={AlignLeftIcon}
      hasArrow
      closeOnClick
      popoverContent={joinArrayBy(
        splitIntoGroups(renderedButtons, COLS).map((group, idx) => (
          <PopoverContainer key={`group-${idx}`}>{group}</PopoverContainer>
        )),
        // Would not throw as now we only have one divider
        <SecondaryDivider key="divider" orientation="horizontal" />
      )}
    >
      Align
    </ButtonWithPopover>
  );
};
