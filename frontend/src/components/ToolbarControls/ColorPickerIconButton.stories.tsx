import { ComponentMeta } from "@storybook/react";
import { ReactComponent as TextColorIcon } from "../../icons/textColor.svg";
import { ReactComponent as FillColorIcon } from "../../icons/fillColor.svg";

import { ColorPickerIconButton } from "./ColorPickerIconButton";

export default {
  component: ColorPickerIconButton,
} as ComponentMeta<typeof ColorPickerIconButton>;

export const ColorPickerIconButtonStory = () => (
  <>
    <ColorPickerIconButton
      key="textColor"
      onSelect={() => {}}
      size={18}
      icon={TextColorIcon}
      value="#B80000"
      onCopyFormatToggle={() => {}}
    />
    <ColorPickerIconButton
      key="fillColor"
      onSelect={() => {}}
      size={18}
      icon={FillColorIcon}
      value="#B80000"
      onCopyFormatToggle={() => {}}
    />
  </>
);
