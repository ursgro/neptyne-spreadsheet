import { ComponentMeta } from "@storybook/react";
import { IconButton, Stack } from "@mui/material";
import WindowIcon from "@mui/icons-material/Window";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";

import { MoreButton } from "./MoreButton";

export default {
  component: MoreButton,
} as ComponentMeta<typeof MoreButton>;

export const MoreButtonStory = () => <MoreButton popoverContent="foo" />;

export const MoreButtonWithContentStory = () => (
  <MoreButton
    popoverContent={
      <Stack direction="row" flexGrow={1}>
        <IconButton>
          <span style={{ fontSize: 18, margin: 12 }}>10</span>
        </IconButton>
        <IconButton>
          <span style={{ fontSize: 24, margin: 12 }}>%</span>
        </IconButton>
        <IconButton>
          <AttachMoneyIcon />
        </IconButton>
        <IconButton>
          <WindowIcon style={{ margin: "12px 0px 12px 12px" }} />
        </IconButton>
      </Stack>
    }
  />
);
