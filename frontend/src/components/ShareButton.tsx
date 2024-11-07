import { FunctionComponent } from "react";
import ShareIcon from "@mui/icons-material/Share";
import { Button } from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
interface ShareButtonProps {
  caption: "Share" | "Remix";
  onClick: () => void;
}

const SHARE_BUTTON_SX = {
  margin: "0 20px",
  textTransform: "none",
};

export const ShareButton: FunctionComponent<ShareButtonProps> = (props) => (
  <Button
    onClick={props.onClick}
    startIcon={props.caption === "Share" ? <ShareIcon /> : <TuneIcon />}
    color="secondary"
    variant="contained"
    disableElevation
    sx={SHARE_BUTTON_SX}
  >
    {props.caption}
  </Button>
);
