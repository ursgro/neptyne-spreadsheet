import React, { useCallback } from "react";
import ArrowLeftIcon from "@mui/icons-material/ArrowLeft";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";

import { Dimension } from "../NeptyneProtocol";

type UnhideButtonDirection = "prev" | "next";

interface HeaderUnhideButtonProps {
  index: number;
  dimension: Dimension;
  hasNextUnHideButton: boolean;
  hasPrevUnHideButton: boolean;
  onClick: (index: number) => void;
  onHideContextMenuButton: () => void;
}

export const HeaderUnhideButton: React.FunctionComponent<HeaderUnhideButtonProps> = (
  props
) => {
  const {
    index,
    dimension,
    hasNextUnHideButton,
    hasPrevUnHideButton,
    onClick,
    onHideContextMenuButton,
  } = props;

  const onIconClick = useCallback(
    (event: React.MouseEvent, direction: UnhideButtonDirection) => {
      event.preventDefault();
      event.stopPropagation();
      const unhideIndex = direction === "prev" ? index - 1 : index + 1;
      onClick(unhideIndex);
      onHideContextMenuButton();
    },
    [index, onClick, onHideContextMenuButton]
  );

  const onIconPrevClick = useCallback(
    (event: React.MouseEvent) => {
      onIconClick(event, "prev");
    },
    [onIconClick]
  );

  const onIconMextClick = useCallback(
    (event: React.MouseEvent) => {
      onIconClick(event, "next");
    },
    [onIconClick]
  );

  if (!hasPrevUnHideButton && !hasNextUnHideButton) {
    return null;
  }

  if (dimension === Dimension.Row) {
    return (
      <div>
        {hasPrevUnHideButton && (
          <ArrowDropDownIcon
            aria-label="row bottom unhide button"
            key={`${index}-row-bottom`}
            className="sheet-header-button unhide-bottom"
            onClick={onIconPrevClick}
          />
        )}
        {hasNextUnHideButton && (
          <ArrowDropUpIcon
            aria-label="row top unhide button"
            key={`${index}-row-top`}
            className="sheet-header-button unhide-top"
            onClick={onIconMextClick}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {hasPrevUnHideButton && (
        <ArrowRightIcon
          aria-label="column left unhide button"
          key={`${index}-column-left`}
          className="sheet-header-button unhide-left"
          onClick={onIconPrevClick}
        />
      )}
      {hasNextUnHideButton && (
        <ArrowLeftIcon
          aria-label="column right unhide button"
          key={`${index}-column-right`}
          className="sheet-header-button unhide-right"
          onClick={onIconMextClick}
        />
      )}
    </>
  );
};
