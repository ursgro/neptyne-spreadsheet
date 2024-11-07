import { ComponentMeta } from "@storybook/react";

import { ShareButton } from "./ShareButton";
import { noop } from "../codemirror-editor/CodeMirror";

export default {
  component: ShareButton,
} as ComponentMeta<typeof ShareButton>;

export const ShareButtonStory = () => <ShareButton onClick={noop} caption={"Share"} />;
