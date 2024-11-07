import { ComponentMeta, Story } from "@storybook/react";
import { OpenDialog, OpenDialogProps } from "./OpenDialog";

const noop = () => {};

export default {
  component: OpenDialog,
} as ComponentMeta<typeof OpenDialog>;

const OpenDialogStoryTemplate: Story<OpenDialogProps> = (args) => (
  <OpenDialog {...args} activeTyneTab="Authored by me" />
);

export const OpenDialogStory = OpenDialogStoryTemplate.bind({});
OpenDialogStory.args = {
  open: true,
  onClose: noop,
  tynes: [],
  errorMessage: "",
  notificationMessage: "",
};
