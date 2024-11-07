import { FunctionComponent } from "react";

import {
  alpha,
  ClickAwayListener,
  Grow,
  MenuList,
  Paper,
  Popper,
  Theme,
  useTheme,
} from "@mui/material";

interface NeptyneMenuDropdownProps {
  isOpen: boolean;
  anchor: HTMLDivElement | null;
  onClose: (event: Event) => void;
  children: React.ReactNode;
}

const GROW_STYLE = {
  transformOrigin: "top-end",
  margin: "5px",
};

const PAPER_STYLE = (theme: Theme) => ({
  boxShadow: `0 4px 4px 0 ${alpha(theme.palette.common.black, 0.08)}`,
});

export const getNeptyneMenuDropdownSX = (theme: Theme) => ({
  backgroundColor: "secondary.lightBackground",
  border: `1px solid ${theme.palette.secondary.selectedButtonBorder}`,
  borderRadius: "3px",
  padding: "3px 0",
  "& .MuiMenuItem-root": {
    ...theme.typography.body1,
    padding: "2px 13px",
    marginLeft: "3px",
    marginRight: "3px",
    borderRadius: "3px",
    display: "block",
    textAlign: "center",
    height: "21px",
    verticalAlign: "middle",
    "&:hover": {
      backgroundColor: "secondary.selectedButtonBackground",
      color: "secondary.main",
    },
  },
});

export const NeptyneMenuDropdown: FunctionComponent<NeptyneMenuDropdownProps> = ({
  isOpen,
  anchor,
  onClose,
  children,
}) => {
  const theme = useTheme();
  return (
    <Popper
      open={isOpen}
      anchorEl={anchor}
      role={undefined}
      transition
      placement="top"
      style={{ zIndex: theme.zIndex.gridWrapperPopover }}
    >
      {({ TransitionProps }) => (
        <Grow {...TransitionProps} style={GROW_STYLE}>
          <Paper sx={PAPER_STYLE}>
            <ClickAwayListener onClickAway={onClose}>
              <MenuList
                id="split-button-menu"
                autoFocusItem
                sx={getNeptyneMenuDropdownSX}
              >
                {children}
              </MenuList>
            </ClickAwayListener>
          </Paper>
        </Grow>
      )}
    </Popper>
  );
};
