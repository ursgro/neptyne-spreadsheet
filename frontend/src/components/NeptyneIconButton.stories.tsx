import { ComponentMeta, Story } from "@storybook/react";
import FileCopyIcon from "@mui/icons-material/FileCopy";

import { NeptyneIconButton, NeptyneIconButtonProps } from "./NeptyneIconButton";
import { noop } from "../codemirror-editor/CodeMirror";
import { NeptyneIconButtonGroup } from "./NeptyneIconButtonGroup";
import { ReactComponent as HyperlinkIcon } from "../icons/hyperlink.svg";

export default {
  component: NeptyneIconButton,
} as ComponentMeta<typeof NeptyneIconButton>;

const ButtonStoryTemplate: Story<NeptyneIconButtonProps> = (args) => (
  <NeptyneIconButton {...args} onClick={noop}>
    foo!
  </NeptyneIconButton>
);

export const ButtonStory = ButtonStoryTemplate.bind({});
ButtonStory.args = {
  isActive: false,
  isDisabled: false,
};

export const IconButtonStory = () => (
  <NeptyneIconButton onClick={noop} icon={FileCopyIcon} />
);

export const TooltippedIconButtonStory = () => (
  <NeptyneIconButton onClick={noop} icon={FileCopyIcon}>
    File
  </NeptyneIconButton>
);

export const IconButtonGroupStory = () => (
  <NeptyneIconButtonGroup>
    <NeptyneIconButton onClick={noop} icon={FileCopyIcon}>
      File
    </NeptyneIconButton>
    <NeptyneIconButton onClick={noop} icon={HyperlinkIcon}>
      Hyperlink
    </NeptyneIconButton>
  </NeptyneIconButtonGroup>
);
