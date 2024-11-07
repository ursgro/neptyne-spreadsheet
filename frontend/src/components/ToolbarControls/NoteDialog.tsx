import React, { useCallback } from "react";

import { NameDialog } from "../../NameDialog";
import { CellAttribute } from "../../NeptyneProtocol";
import { CellAttributes } from "../../SheetUtils";

export interface NoteDialogProps {
  currentCellAttributes: CellAttributes;
  onCellAttributeChange: (name: CellAttribute, color: string | undefined) => void;
  onClose: () => void;
}

export const NoteDialog: React.FunctionComponent<NoteDialogProps> = (props) => {
  const { currentCellAttributes, onCellAttributeChange, onClose } = props;

  const value = currentCellAttributes[CellAttribute.Note] ?? "";

  const onChange = useCallback(
    (newNote: string | null) => {
      if (newNote !== null && newNote !== value) {
        onCellAttributeChange(CellAttribute.Note, newNote);
      }
      onClose();
    },
    [value, onCellAttributeChange, onClose]
  );

  return (
    <NameDialog
      open
      value={value}
      onClose={onChange}
      title="Add/Edit Cell Note"
      prompt="Add or Edit a note for a cell to explain what's going on"
      autoFocus
    />
  );
};
