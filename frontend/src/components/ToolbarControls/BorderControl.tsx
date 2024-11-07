import React, { ChangeEvent, ElementType, FunctionComponent, useCallback } from "react";
import { CellAttribute } from "../../NeptyneProtocol";
import { BorderAttribute } from "./border-handler";
import { ReactComponent as BordersIcon } from "../../icons/borders.svg";
import { ReactComponent as AllBordersIcon } from "../../icons/allBorders.svg";
import { ReactComponent as InnerBordersIcon } from "../../icons/innerBorders.svg";
import { ReactComponent as OuterBordersIcon } from "../../icons/outerBorders.svg";
import { ReactComponent as HorizontalBordersIcon } from "../../icons/horizontalBorders.svg";
import { ReactComponent as VerticalBordersIcon } from "../../icons/verticalBorders.svg";
import { ReactComponent as LeftBordersIcon } from "../../icons/leftBorders.svg";
import { ReactComponent as TopBordersIcon } from "../../icons/topBorders.svg";
import { ReactComponent as RightBordersIcon } from "../../icons/rightBorders.svg";
import { ReactComponent as BottomBordersIcon } from "../../icons/bottomBorders.svg";
import { ReactComponent as NoBordersIcon } from "../../icons/noBorders.svg";
import { ButtonWithPopover, PopoverContainer } from "../ButtonWithPopover";
import { splitIntoGroups } from "../../commonUtils";
import { ToolbarIconButton } from "./ToolbarIconButton";
import { alpha, Box, Checkbox, styled, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";

interface GridlinesCheckboxProps {
  areGridlinesHidden: boolean;
  onSheetAttributesChange: (attribute: string, value: boolean) => void;
}

const getGridlinesCheckboxLabelBaseActiveSX = (theme: Theme): SystemStyleObject => ({
  backgroundColor: alpha(theme.palette.secondary.main, 0.11),
});

const getGridlinesCheckboxLabelBaseSX = (theme: Theme): SystemStyleObject => ({
  ...theme.typography.caption,
  alignItems: "center",
  border: "1px solid transparent",
  borderRadius: "5px",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  margin: "0 1px",
  padding: "0 4px 0 8px",
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionTimingFunction: theme.transitions.easing.easeOut,
  transitionProperty: "color, background-color, border-color",
  "&:hover": {
    ...getGridlinesCheckboxLabelBaseActiveSX(theme),
  },
  ".MuiCheckbox-root": {
    padding: "4px",
    ".MuiSvgIcon-root": {
      fontSize: "inherit",
    },
  },
});

const getGridlinesCheckboxLabelActiveSX = (theme: Theme): SystemStyleObject => ({
  ...getGridlinesCheckboxLabelBaseSX(theme),
  ...getGridlinesCheckboxLabelBaseActiveSX(theme),
  borderColor: theme.palette.secondary.lightBorder,
  color: theme.palette.secondary.main,
});

const GridlinesCheckbox: FunctionComponent<GridlinesCheckboxProps> = ({
  areGridlinesHidden,
  onSheetAttributesChange,
}) => {
  const handleGridlinesToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSheetAttributesChange("areGridlinesHidden", !event.target.checked);
    },
    [onSheetAttributesChange]
  );

  return (
    <Box
      component="label"
      data-testid="ToggleGridlinesLabel"
      sx={
        areGridlinesHidden
          ? getGridlinesCheckboxLabelBaseSX
          : getGridlinesCheckboxLabelActiveSX
      }
    >
      Show Gridlines
      <Checkbox
        checked={!areGridlinesHidden}
        onChange={handleGridlinesToggle}
        color="secondary"
      />
    </Box>
  );
};

export interface ButtonControlProps {
  isDisabled: boolean;
  areGridlinesHidden?: boolean;
  onUpdateCellBorders: (cellAttribute: CellAttribute, attributeValue: string) => void;
  onSheetAttributeChange: (name: string, newValue: any | undefined) => void;
}

interface ButtonModel {
  value: BorderAttribute;
  tooltip: string;
  Icon: ElementType;
}

const buttonsModel: ButtonModel[] = [
  {
    value: BorderAttribute.All,
    tooltip: "All",
    Icon: AllBordersIcon,
  },
  {
    value: BorderAttribute.Inner,
    tooltip: "Inner",
    Icon: InnerBordersIcon,
  },
  {
    value: BorderAttribute.Outer,
    tooltip: "Outer",
    Icon: OuterBordersIcon,
  },
  {
    value: BorderAttribute.Horizontal,
    tooltip: "Horizontal",
    Icon: HorizontalBordersIcon,
  },
  {
    value: BorderAttribute.Vertical,
    tooltip: "Vertical",
    Icon: VerticalBordersIcon,
  },
  {
    value: BorderAttribute.Left,
    tooltip: "Left",
    Icon: LeftBordersIcon,
  },
  {
    value: BorderAttribute.Top,
    tooltip: "Top",
    Icon: TopBordersIcon,
  },
  {
    value: BorderAttribute.Right,
    tooltip: "Right",
    Icon: RightBordersIcon,
  },
  {
    value: BorderAttribute.Bottom,
    tooltip: "Bottom",
    Icon: BottomBordersIcon,
  },
  {
    value: BorderAttribute.Clear,
    tooltip: "Clear",
    Icon: NoBordersIcon,
  },
];

const SIZE = 18;

const COLS = 5;

const BorderControlContainer = styled("div")({
  margin: "-5px",
});

export const BorderControl: FunctionComponent<ButtonControlProps> = ({
  areGridlinesHidden,
  isDisabled,
  onUpdateCellBorders,
  onSheetAttributeChange,
}) => {
  const buttonHandlers = buttonsModel.map((button) =>
    // Incorrectly thinks that hook is defined inside another hook,
    // while we're just iterating through two constants, which is fine.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useCallback(() => {
      onUpdateCellBorders(CellAttribute.Border, button.value);
      // Cause of issue above thinks that button is a prop, while it isn't.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onUpdateCellBorders])
  );

  const renderedButtons = buttonsModel.map((button, index) => (
    <ToolbarIconButton
      key={button.value}
      testId={`border-control-${button.value}`}
      tooltip={button.tooltip}
      icon={button.Icon}
      onClick={buttonHandlers[index]}
      size={SIZE}
    />
  ));

  return (
    <ButtonWithPopover
      popoverId="BordersPopover"
      testId="BordersButton"
      popoverContent={
        <BorderControlContainer>
          {splitIntoGroups(renderedButtons, COLS).map((group, idx) => (
            <PopoverContainer key={`group-${idx}`}>{group}</PopoverContainer>
          ))}
          <GridlinesCheckbox
            areGridlinesHidden={areGridlinesHidden ?? false}
            onSheetAttributesChange={onSheetAttributeChange}
          />
        </BorderControlContainer>
      }
      icon={BordersIcon}
      isDisabled={isDisabled}
      hasArrow
    >
      Borders
    </ButtonWithPopover>
  );
};
