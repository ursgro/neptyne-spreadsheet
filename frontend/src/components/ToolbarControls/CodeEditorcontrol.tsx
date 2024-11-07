import { FunctionComponent } from "react";
import { ToolbarIconButton } from "./ToolbarIconButton";
import TerminalIcon from "@mui/icons-material/Terminal";

export interface CodeEditorControlProps {
  isActive: boolean;
  onClick: () => void;
}

export const CodeEditorControl: FunctionComponent<CodeEditorControlProps> = (props) => (
  <ToolbarIconButton icon={TerminalIcon} {...props}>
    Code Editor
  </ToolbarIconButton>
);
