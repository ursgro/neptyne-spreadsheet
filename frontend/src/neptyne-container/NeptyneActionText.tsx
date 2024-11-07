import React, { FunctionComponent, ReactNode } from "react";
import { ListItemText } from "@mui/material";
import { makeHotKeyHumanReadable } from "../hotkeyUtils";

const ACTION_TEXT_WITH_HELP_STYLE = {
  display: "flex",
  justifyContent: "space-between",
};

export interface NeptyneActionTextProps {
  children?: ReactNode;
  hotKey?: string;
}

export const NeptyneActionText: FunctionComponent<NeptyneActionTextProps> = ({
  children,
  hotKey,
}) => {
  if (hotKey) {
    const secondaryContent = makeHotKeyHumanReadable(hotKey);
    return (
      <ListItemText
        primary={children}
        secondary={secondaryContent}
        sx={ACTION_TEXT_WITH_HELP_STYLE}
      />
    );
  } else {
    return <ListItemText>{children}</ListItemText>;
  }
};
