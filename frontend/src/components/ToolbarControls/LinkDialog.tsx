import React, { useCallback } from "react";

import { NameDialog } from "../../NameDialog";
import { CellAttribute } from "../../NeptyneProtocol";
import { CellAttributes } from "../../SheetUtils";

export interface LinkDialogProps {
  currentCellAttributes: CellAttributes;
  onCellAttributeChange: (name: CellAttribute, color: string | undefined) => void;
  onClose: () => void;
  onErrorDisplay?: (msg: string) => void;
}

export const LinkDialog: React.FunctionComponent<LinkDialogProps> = (props) => {
  const { currentCellAttributes, onCellAttributeChange, onClose, onErrorDisplay } =
    props;

  const value = currentCellAttributes[CellAttribute.Link] ?? "";

  const onChange = useCallback(
    (newLink: string | null) => {
      if (newLink !== null) {
        if (!newLink && value) {
          // Specifying undefined is a bad practice,
          // but this is how it typed.
          onCellAttributeChange(CellAttribute.Link, undefined);
        }

        if (newLink && newLink !== value) {
          try {
            new URL(newLink);
            onCellAttributeChange(CellAttribute.Link, newLink);
          } catch (error) {
            onErrorDisplay?.("Invalid URL");
            return;
          }
        }
      }

      onClose();
    },
    [value, onCellAttributeChange, onClose, onErrorDisplay]
  );

  return (
    <NameDialog
      open
      value={value}
      onClose={onChange}
      title="Link a cell"
      prompt="Enter the url that this cell should link to or empty for none"
      stayOnConfirm
      autoFocus
    />
  );
};
