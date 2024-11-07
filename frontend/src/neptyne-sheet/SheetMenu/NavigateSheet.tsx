import { FunctionComponent } from "react";

import { ReactComponent as ArrowRight } from "../../icons/arrowRight.svg";
import { ReactComponent as ArrowLeft } from "../../icons/arrowLeft.svg";

import { Box, Icon, IconButton } from "@mui/material";
import { ARROWS_SX } from "./sheet-menu-styles";

export interface NavigateSheetProps {
  onNavigateRight: () => void;
  onNavigateLeft: () => void;
}

export const NavigateSheet: FunctionComponent<NavigateSheetProps> = (props) => (
  <Box marginRight="8px">
    <IconButton
      data-testid="navigate-left-sheet"
      aria-label="navigate left sheet"
      onClick={props.onNavigateLeft}
      sx={ARROWS_SX}
    >
      <Icon component={ArrowLeft} />
    </IconButton>
    <IconButton
      data-testid="navigate-right-sheet"
      aria-label="navigate right sheet"
      onClick={props.onNavigateRight}
      sx={ARROWS_SX}
    >
      <Icon component={ArrowRight} />
    </IconButton>
  </Box>
);
