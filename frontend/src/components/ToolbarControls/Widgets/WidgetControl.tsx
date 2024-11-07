import { ComponentProps, FunctionComponent, memo, useMemo } from "react";
import { ButtonWithPopover, PopoverContainer } from "../../ButtonWithPopover";
import { ReactComponent as WidgetIcon } from "../../../icons/widget.svg";
import AddchartOutlinedIcon from "@mui/icons-material/AddchartOutlined";

import { MenuItem, MenuList, Theme } from "@mui/material";
import { WidgetRegistry } from "../../../NeptyneProtocol";
import { SystemStyleObject } from "@mui/system";
import { WIDGET_ICONS } from "./widgetConstants";

type WidgetType = "Input" | "Output";

const WIDGET_CONTROL_NAMES = { Input: "Widgets", Output: "Charts" };

export interface WidgetControlProps {
  isDisabled: boolean;
  widgetRegistry: WidgetRegistry;
  widgetType: WidgetType;
  onSelect: (widgetType: string) => void;
  onClick?: () => void;
}

export const WidgetControl: FunctionComponent<WidgetControlProps> = memo(
  ({ isDisabled, widgetRegistry, widgetType, onClick, onSelect }) => {
    return (
      <ButtonWithPopover
        testId="ToolbarWidgetButton"
        popoverId="toolbar-widget"
        isDisabled={isDisabled}
        popoverContent={
          <WidgetControlPopover
            widgetRegistry={widgetRegistry}
            widgetType={widgetType}
            onSelect={onSelect}
          />
        }
        icon={widgetType === "Input" ? WidgetIcon : AddchartOutlinedIcon}
        onClick={onClick}
        hasArrow
        closeOnClick
      >
        {WIDGET_CONTROL_NAMES[widgetType]}
      </ButtonWithPopover>
    );
  }
);
WidgetControl.displayName = "WidgetControl";

const WIDGET_MENU_SX = (theme: Theme): SystemStyleObject => ({
  backgroundColor: "secondary.lightBackground",
  borderRadius: "3px",
  padding: "0px",
  "& .MuiMenuItem-root": {
    ...theme.typography.body1,
    padding: "0px",
    borderRadius: "3px",
    minWidth: "100px",
    textAlign: "left",
    height: "21px",
    verticalAlign: "middle",
    display: "flex",
    alignItems: "center",
    "&.buttons-item": {
      gap: "6px",
    },
    "&:hover:not(.buttons-item)": {
      backgroundColor: "secondary.hover",
    },
    "&.buttons-item:hover": {
      backgroundColor: "inherit",
    },
    "&:not(:last-child)": {
      marginBottom: "5px",
    },
  },
  "& svg": {
    width: 18,
    height: 18,
  },
});

const WidgetMenuList: FunctionComponent<ComponentProps<typeof MenuList>> = (props) => (
  <MenuList {...props} sx={WIDGET_MENU_SX} />
);

interface WidgetControlPopoverProps {
  widgetRegistry: WidgetRegistry;
  widgetType: WidgetType;
  onSelect: (widgetType: string) => void;
}

const WidgetControlPopover: FunctionComponent<WidgetControlPopoverProps> = ({
  widgetRegistry,
  widgetType,
  onSelect,
}) => {
  const widgetListItems = useMemo(
    () =>
      Object.values(widgetRegistry.widgets)
        .filter(({ category }) => category === widgetType)
        .map((widget) => (
          <MenuItem key={widget.name} onClick={() => onSelect(widget.name)}>
            {WIDGET_ICONS[widget.name as keyof typeof WIDGET_ICONS] || <WidgetIcon />}{" "}
            {widget.name}
          </MenuItem>
        )),
    [onSelect, widgetRegistry.widgets, widgetType]
  );

  return (
    <PopoverContainer>
      <WidgetMenuList>{widgetListItems}</WidgetMenuList>
    </PopoverContainer>
  );
};
