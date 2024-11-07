import { ComponentMeta } from "@storybook/react";
import { IconButton } from "@mui/material";
import WindowIcon from "@mui/icons-material/Window";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import Divider from "@mui/material/Divider";

import { AdaptiveToolbar } from "./AdaptiveToolbar";

export default {
  component: AdaptiveToolbar,
} as ComponentMeta<typeof AdaptiveToolbar>;

export const AdaptiveToolbarSingleElementStory = () => {
  const children = [<span>1</span>];
  return <AdaptiveToolbar>{children}</AdaptiveToolbar>;
};

export const AdaptiveToolbarStory = () => {
  return (
    <AdaptiveToolbar>
      <IconButton>
        <span style={{ fontSize: 18, margin: 12 }}>10</span>
      </IconButton>
      <Divider orientation="vertical" flexItem />
      <IconButton>
        <span style={{ fontSize: 24, margin: 12 }}>%</span>
      </IconButton>
      <IconButton>
        <AttachMoneyIcon />
      </IconButton>
      <IconButton>
        <WindowIcon style={{ margin: "12px 0px 12px 12px" }} />
      </IconButton>
      <Divider orientation="vertical" flexItem />
      <IconButton>
        <span style={{ fontSize: 24, margin: 12 }}>%</span>
      </IconButton>
      <IconButton>
        <AttachMoneyIcon />
      </IconButton>
      <IconButton>
        <WindowIcon style={{ margin: "12px 0px 12px 12px" }} />
      </IconButton>
      <Divider orientation="vertical" flexItem />
      <IconButton>
        <span style={{ fontSize: 24, margin: 12 }}>%</span>
      </IconButton>
      <IconButton>
        <AttachMoneyIcon />
      </IconButton>
      <IconButton>
        <WindowIcon style={{ margin: "12px 0px 12px 12px" }} />
      </IconButton>
      <Divider orientation="vertical" flexItem />
      <IconButton>
        <span style={{ fontSize: 24, margin: 12 }}>%</span>
      </IconButton>
      <IconButton>
        <AttachMoneyIcon />
      </IconButton>
      <IconButton>
        <WindowIcon style={{ margin: "12px 0px 12px 12px" }} />
      </IconButton>
      <Divider orientation="vertical" flexItem />
      <IconButton>
        <span style={{ fontSize: 24, margin: 12 }}>%</span>
      </IconButton>
      <IconButton>
        <AttachMoneyIcon />
      </IconButton>
      <IconButton>
        <WindowIcon style={{ margin: "12px 0px 12px 12px" }} />
      </IconButton>
      <Divider orientation="vertical" flexItem />
      <IconButton>
        <span style={{ fontSize: 24, margin: 12 }}>%</span>
      </IconButton>
      <IconButton>
        <AttachMoneyIcon />
      </IconButton>
      <IconButton>
        <WindowIcon style={{ margin: "12px 0px 12px 12px" }} />
      </IconButton>
    </AdaptiveToolbar>
  );
};
