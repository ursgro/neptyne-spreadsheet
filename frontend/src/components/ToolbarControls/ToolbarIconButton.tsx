import React, { FunctionComponent } from "react";
import { NeptyneIconButton, NeptyneIconButtonProps } from "../NeptyneIconButton";
import { makeHotKeyHumanReadable } from "../../hotkeyUtils";

export interface ToolbarIconButtonProps extends NeptyneIconButtonProps {
  hotKey?: string;
}

export const ToolbarIconButton: FunctionComponent<ToolbarIconButtonProps> = ({
  tooltip,
  hotKey,
  ...props
}) => {
  if (tooltip && hotKey) tooltip += ` (${makeHotKeyHumanReadable(hotKey)})`;

  return <NeptyneIconButton {...props} tooltip={tooltip} />;
};
