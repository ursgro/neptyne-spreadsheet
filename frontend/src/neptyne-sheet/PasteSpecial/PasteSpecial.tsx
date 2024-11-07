import { observer } from "mobx-react-lite";
import { OverlayPosition, usePasteSpecialContext } from "./paste-special.store";
import { Box, Button, Menu, MenuItem, Paper } from "@mui/material";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import { FunctionComponent, useState } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

interface PasteSpecialProps {
  overlayPosition: OverlayPosition;
  frozenRowsCount: number;
  frozenColsCount: number;
}

export const PasteSpecial: FunctionComponent<PasteSpecialProps> = observer(
  ({ frozenRowsCount, frozenColsCount, overlayPosition }) => {
    const pasteSpecialStore = usePasteSpecialContext();
    const position = pasteSpecialStore.position;

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const isOpen = !!anchorEl;
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget.parentElement);
    };
    const handleClose = () => {
      setAnchorEl(null);
    };

    if (
      !position ||
      !pasteSpecialStore.shouldRender(frozenRowsCount, frozenColsCount, overlayPosition)
    )
      return null;

    return (
      <>
        <Box sx={{ position: "absolute", left: position.x, top: position.y }}>
          <Paper variant="outlined" color="grey.100" elevation={3}>
            <Button
              data-testid="paste-special-btn"
              color="secondary"
              onClick={handleClick}
              size="small"
              disableFocusRipple
              disableRipple
              endIcon={<KeyboardArrowDownIcon />}
            >
              <ContentPasteIcon />
            </Button>
          </Paper>
          <Menu
            PaperProps={{
              sx: {
                border: (theme) => `1px solid ${theme.palette.grey[200]}`,
              },
            }}
            anchorEl={anchorEl}
            open={isOpen}
            onClose={handleClose}
          >
            {pasteSpecialStore.pasteTypes.map((pasteType) => (
              <MenuItem
                key={pasteType}
                data-testid={`paste-special-${pasteType}`}
                onClick={() => {
                  pasteSpecialStore.applyPasteSpecial(pasteType);
                  handleClose();
                }}
              >
                {pasteType.charAt(0).toUpperCase() + pasteType.slice(1)}
              </MenuItem>
            ))}
          </Menu>
        </Box>
      </>
    );
  }
);
