import { ComponentMeta } from "@storybook/react";
import FileCopyIcon from "@mui/icons-material/FileCopy";

import { ButtonWithPopover } from "./ButtonWithPopover";

export default {
  component: ButtonWithPopover,
} as ComponentMeta<typeof ButtonWithPopover>;

export const IconButtonStory = () => (
  <ButtonWithPopover
    popoverId="icon-button-story"
    icon={FileCopyIcon}
    popoverContent={
      <>
        and here is dropdown
        <FileCopyIcon fontSize="small" />
      </>
    }
  />
);

export const TooltippedIconButtonStory = () => (
  <ButtonWithPopover
    popoverId="tooltipped-icon-button-story"
    popoverContent={<FileCopyIcon fontSize="small" />}
    icon={FileCopyIcon}
  >
    File
  </ButtonWithPopover>
);
