import { ComponentMeta, Story } from "@storybook/react";
import { SheetsMenu, SheetsMenuProps } from "./SheetMenu";

const noop = () => {};

export default {
  component: SheetsMenu,
} as ComponentMeta<typeof SheetsMenu>;

const SheetsMenuStoryTemplate: Story<SheetsMenuProps> = (args) => (
  <SheetsMenu {...args} />
);

export const SheetsMenuStory = SheetsMenuStoryTemplate.bind({});
SheetsMenuStory.args = {
  sheets: [
    { name: "Sheet 1", id: 1 },
    { name: "Sheet 2", id: 2 },
    { name: "Sheet 3", id: 3 },
  ],
  activeSheetId: 2,
  onSheetClick: noop,
  onAddSheet: noop,
  onDeleteSheet: noop,
  onRenameSheet: noop,
};
