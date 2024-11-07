import React, { FunctionComponent, useCallback } from "react";
import { ToolbarIconButton } from "./ToolbarIconButton";
import { ReactComponent as HyperlinkIcon } from "../../icons/hyperlink.svg";
import {
  ModalReducerAction,
  useModalDispatch,
} from "../../neptyne-container/NeptyneModals";
import { LinkDialog } from "./LinkDialog";

export interface LinkControlProps {
  isActive: boolean;
  isDisabled: boolean;
}

export const LinkControl: FunctionComponent<LinkControlProps> = ({
  isActive,
  isDisabled,
}) => {
  const modalDispatch = useModalDispatch();

  const handleLinkModalOpen = useCallback(() => {
    modalDispatch({
      action: ModalReducerAction.Show,
      props: {
        element: LinkDialog,
      },
    });
  }, [modalDispatch]);

  return (
    <ToolbarIconButton
      onClick={handleLinkModalOpen}
      isActive={isActive}
      isDisabled={isDisabled}
      icon={HyperlinkIcon}
    >
      Hyperlink
    </ToolbarIconButton>
  );
};
