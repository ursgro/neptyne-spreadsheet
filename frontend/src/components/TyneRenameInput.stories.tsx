import { ComponentMeta } from "@storybook/react";
import { useState } from "react";

import { TyneRenameInput } from "./TyneRenameInput";

export default {
  component: TyneRenameInput,
} as ComponentMeta<typeof TyneRenameInput>;

export const TyneRenameInputStory = () => {
  const [value, setValue] = useState("Foo");
  return (
    <TyneRenameInput
      initialValue={value}
      onRename={(newValue) => setValue(newValue)}
      onFocus={noop}
    />
  );
};

const noop = () => {};
