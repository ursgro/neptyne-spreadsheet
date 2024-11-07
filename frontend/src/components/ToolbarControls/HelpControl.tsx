import { FunctionComponent, memo } from "react";
import { ReactComponent as HelpIcon } from "../../icons/help.svg";

import { MenuItem, MenuList, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { ButtonWithPopover, PopoverContainer } from "../ButtonWithPopover";

export const HelpControl: FunctionComponent = memo(() => {
  return (
    <ButtonWithPopover
      testId="ToolbarHelpButton"
      popoverId="toolbar-help"
      isDisabled={false}
      popoverContent={<HelpControlPopover />}
      icon={HelpIcon}
      closeOnClick
      hasArrow
    ></ButtonWithPopover>
  );
});
HelpControl.displayName = "HelpControl";

const HELP_MENU_SX = (theme: Theme): SystemStyleObject => ({
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
    width: 24,
    height: 24,
  },
});

const HelpControlPopover: FunctionComponent = () => {
  return (
    <PopoverContainer>
      <MenuList sx={HELP_MENU_SX}>
        <MenuItem
          onClick={() => {
            window.location.pathname = "/-/tutorial";
          }}
        >
          🎓 Start Tutorial
        </MenuItem>
        <MenuItem
          onClick={() => {
            window.open("https://www.neptyne.com/developer-guide");
          }}
        >
          📖 Developer Guide
        </MenuItem>
        <MenuItem
          onClick={() => {
            window.open("https://discord.gg/HwfMcqhMWt");
          }}
        >
          💬 Discord
        </MenuItem>
        <MenuItem
          onClick={() => {
            window.open("https://www.youtube.com/channel/UCnd_JSAa0VaDOiJ965QffNQ");
          }}
        >
          🎥 Youtube
        </MenuItem>
      </MenuList>
    </PopoverContainer>
  );
};
