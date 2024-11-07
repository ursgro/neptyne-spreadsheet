import Markdown from "react-markdown";
import { Box, Modal, Paper } from "@mui/material";

const paperStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "95%",
  maxHeight: "400px",
  paddingX: "10px",
  paddingY: "5px",
};

interface Props {
  releaseNotes: string | null;
  onClose: () => void;
}

export const ReleaseNotes = ({ releaseNotes, onClose }: Props) => {
  const content =
    releaseNotes === null ? (
      <div>Loading...</div>
    ) : (
      <Markdown linkTarget="_blank">{releaseNotes}</Markdown>
    );

  return (
    <Modal open onClose={onClose}>
      <Paper sx={paperStyle}>
        <Box maxHeight="380px" overflow="scroll">
          {content}
        </Box>
      </Paper>
    </Modal>
  );
};
