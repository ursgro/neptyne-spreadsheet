import { FunctionComponent } from "react";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { ButtonWithPopover, ButtonWithPopoverProps } from "../../ButtonWithPopover";

type MoreButtonProps = Omit<ButtonWithPopoverProps, "children" | "popoverId" | "icon">;

const MORE_BUTTON_ID = "more-button-popover";

export const MoreButton: FunctionComponent<MoreButtonProps> = (props) => {
  return (
    <ButtonWithPopover {...props} popoverId={MORE_BUTTON_ID} icon={MoreHorizIcon}>
      More
    </ButtonWithPopover>
  );
};
