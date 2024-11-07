import * as React from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  ListItem,
  Modal,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect } from "react";
import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

interface SnippetsMenuProps {
  insertSnippet: (msg: string, code: string) => void;
}

export type GetStartedGSheetsProps = SnippetsMenuProps & {
  showOnStartDefault: boolean;
  onClose: (showAgain: boolean) => void;
  onShowAIPrompt: () => void;
};

const centerPaperStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "95%",
};

const actionStyle = {
  cursor: "pointer",
  "&:hover": {
    backgroundColor: "#f0f0f0",
  },
  backgroundColor: "#f7f7f7",
  margin: "5px",
  marginTop: "8px",
  width: "unset",
};

const actionStyleEnclosed = {
  ...actionStyle,
  border: "1px solid #aaaaaa",
  borderRadius: "3px",
};

const MainMenuAction = (props: {
  onClick: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  enclosed?: boolean;
}) => {
  return (
    <ListItem
      onClick={props.onClick}
      sx={props.enclosed ? actionStyleEnclosed : actionStyle}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        width="100%"
        alignItems="center"
      >
        <Stack flexGrow={1}>
          <Typography variant="h1">{props.title}</Typography>
          {props.description && (
            <Box marginTop="5px">
              <Typography variant="body2" sx={{ whiteSpace: "normal" }}>
                {props.description}
              </Typography>
            </Box>
          )}
        </Stack>
        {props.icon || null}
      </Stack>
    </ListItem>
  );
};

const SnippetsMenu = ({ insertSnippet }: SnippetsMenuProps) => {
  const [snippets, setSnippets] = React.useState([] as any[]);

  useEffect(() => {
    fetch(
      "https://raw.githubusercontent.com/neptyneco/codesamples/snippets-json/code-snippets.json"
    )
      .then((response) => response.json())
      .then((data) => setSnippets(data));
  }, []);

  const handleSnippetClick = (code: string) => {
    insertSnippet("", code);
  };

  const snippetItems = snippets.map(({ name, code, description }) => (
    <MainMenuAction
      key={name}
      title={name}
      description={description}
      onClick={() => handleSnippetClick(code)}
    />
  ));

  return <List>{snippetItems}</List>;
};

export const GetStartedGSheets = (props: GetStartedGSheetsProps) => {
  const [showOnStart, setShowOnStart] = React.useState<"yes" | "no" | "default">(
    "default"
  );

  const checkedShowOnStart =
    showOnStart === "yes" || (showOnStart === "default" && props.showOnStartDefault);

  const handleSnippet = (msg: string, code: string) => {
    props.insertSnippet(msg, code);
    handleClose();
  };

  const handleClose = () => {
    props.onClose(checkedShowOnStart);
  };

  const handleGallery = () => {
    window.open("https://www.neptyne.com/google-sheets/gallery", "_blank");
  };

  const handleAI = () => {
    props.onShowAIPrompt();
    handleClose();
  };

  const handleCheckShowOnStart = () => {
    setShowOnStart(checkedShowOnStart ? "no" : "yes");
  };

  return (
    <Modal open={true} onClose={handleClose}>
      <Paper sx={centerPaperStyle}>
        <Box margin={2}>
          <Typography variant="h1" fontSize={18}>
            Welcome to Neptyne!
          </Typography>
          <Typography variant="body1" marginTop={2}>
            Start with a blank code panel, or choose an option below to get started
          </Typography>
        </Box>
        <SnippetsMenu insertSnippet={handleSnippet} />
        <MainMenuAction
          onClick={handleAI}
          title="🪄 Ask the AI"
          description="Use your own prompt to generate some code"
          enclosed
        />
        <MainMenuAction
          onClick={handleGallery}
          title="📸 View the Gallery"
          description="Examples built with Neptyne"
          icon={<OpenInNewIcon fontSize="small" />}
          enclosed
        />
        <Stack
          direction="row"
          sx={{ fontSize: 8 }}
          justifyContent="space-between"
          paddingX="10px"
        >
          <FormControlLabel
            control={
              <Checkbox checked={checkedShowOnStart} onClick={handleCheckShowOnStart} />
            }
            label="Show on Start"
            componentsProps={{ typography: { variant: "caption" } }}
          />
          <Button onClick={handleClose}>Close</Button>
        </Stack>
      </Paper>
    </Modal>
  );
};
