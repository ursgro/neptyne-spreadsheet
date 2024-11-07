import React from "react";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { NeptyneDialog } from "./NeptyneDialog";
import { Link, Typography } from "@mui/material";
import { LOGO_ICON } from "./RenderTools";

interface ReadonlyScreenProps {
  open: boolean;
  loggedIn: boolean;
  onClose: (action: "close" | "copy" | "login" | "signup") => void;
}

export const ReadonlyScreen = ({ open, onClose, loggedIn }: ReadonlyScreenProps) => {
  const dialogLabel = "form-dialog-title";

  const handleClose = () => onClose("close");

  const title = loggedIn ? "This Tyne is Read-only" : "Welcome to Neptyne";

  return (
    <NeptyneDialog
      open={open}
      onClose={handleClose}
      onConfirm={handleClose}
      ariaLabel={dialogLabel}
    >
      <DialogTitle id={dialogLabel}>
        {" "}
        <Typography variant="h1" style={{ fontSize: 22 }}>
          {LOGO_ICON} {title}
        </Typography>{" "}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          <Typography variant="body1" style={{ fontSize: 18, color: "#202020" }}>
            {loggedIn ? (
              <>
                <p>
                  The Tyne you have opened is in read-only mode. You can't edit anything
                  or run the code. You can explore the data and the code though!
                </p>
                <p>
                  This happens if somebody shared a Tyne with you read-only, or if they
                  made a Tyne public by publishing it.
                </p>
                <p>
                  You can{" "}
                  <Link
                    href="#"
                    onClick={() => {
                      onClose("copy");
                    }}
                  >
                    make a copy
                  </Link>{" "}
                  to dive deeper and run the code or edit the data.
                </p>
              </>
            ) : (
              <>
                <p>
                  You have reached a tyne (our document) that has been published and is
                  accessible to anybody. You can click the close button below and
                  explore the data and the code. Enjoy!
                </p>
                <p>
                  If you want to edit the data or run the code, you need to{" "}
                  <Link
                    href="#"
                    onClick={(event) => {
                      onClose("login");
                      event.preventDefault();
                    }}
                  >
                    log in
                  </Link>{" "}
                  or if you don't have one,{" "}
                  <Link
                    href="#"
                    onClick={(event) => {
                      onClose("signup");
                      event.preventDefault();
                    }}
                  >
                    create an account
                  </Link>{" "}
                  . It's free!
                </p>
              </>
            )}
          </Typography>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={() => onClose("close")} color="primary">
          Close
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};
