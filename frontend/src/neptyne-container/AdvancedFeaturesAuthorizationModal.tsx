import { getGSheetAppConfig } from "../gsheet_app_config";
import { useEffect } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";

interface Props {
  onClose: () => void;
}

const openAdvancedFeaturesDialog = () => {
  const gsheetAppConfig = getGSheetAppConfig();
  const serverUrlBase = gsheetAppConfig.serverUrlBase || "";
  const params = new URLSearchParams({ poppedOut: "true" });
  params.append(
    "gsheetAppConfig",
    JSON.stringify({
      ...gsheetAppConfig,
      gsWidgetMode: "advanced-features",
    })
  );
  const url = `${serverUrlBase}/-/?${params.toString()}`;
  const target = "neptyne-advanced-features";
  const width = 700;
  const height = 500;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;
  const newWindow = window.open(
    url,
    target,
    `width=${width},height=${height},left=${left},top=${top},resizable,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no,directories=no`
  );
  if (!newWindow) {
    window.open(url, target);
  }
};

export const AdvancedFeaturesAuthorizationModal = ({ onClose }: Props) => {
  useEffect(() => {
    openAdvancedFeaturesDialog();
  });

  return (
    <Dialog open={true} onClose={onClose}>
      <DialogTitle>
        <h3>Authorization Required</h3>
      </DialogTitle>
      <DialogContent>
        <p>
          In order to use advanced features in Neptyne, authorize the app to access your
          Google Sheets.
        </p>
        <DialogActions>
          <Button onClick={() => onClose()}>Close</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
};
