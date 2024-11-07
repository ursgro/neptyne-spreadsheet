import { NeptyneDialog } from "../NeptyneDialog";
import DialogTitle from "@mui/material/DialogTitle";
import React from "react";
import DialogContent from "@mui/material/DialogContent";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import { CardActionArea, CardContent } from "@mui/material";
import Typography from "@mui/material/Typography";
import QuizIcon from "@mui/icons-material/Quiz";
import BorderAllIcon from "@mui/icons-material/BorderAll";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";

interface CardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

const OptionCard = ({ title, description, icon, action }: CardProps) => {
  return (
    <Card sx={{ width: 200, height: 200, margin: 1 }}>
      <CardActionArea onClick={action}>
        <CardContent sx={{ height: 200 }}>
          <Typography variant="h1" component="div" align="center" marginBottom={1}>
            {title}
          </Typography>
          <Stack direction="row" justifyContent="center" alignItems="center">
            {icon}
          </Stack>
          <Typography variant="subtitle2" align="center" marginTop={1}>
            {description}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export const NewUserDialog = ({ showGallery }: { showGallery: () => void }) => {
  const iconStyle = { width: 75, height: 75 };

  return (
    <NeptyneDialog open onClose={() => {}} maxWidth="xl">
      <DialogTitle>Welcome to Neptyne! Choose an option to get started.</DialogTitle>
      <DialogContent>
        <Stack direction="row">
          <OptionCard
            title="Tutorial"
            description="Start with an interactive tutorial of Neptyne's features"
            icon={<QuizIcon sx={iconStyle} htmlColor={"#2185D0"} />}
            action={() => {
              window.location.assign("/-/tutorial");
            }}
          />
          <OptionCard
            title="Empty Tyne"
            description="Jump right in with an empty Tyne"
            icon={<BorderAllIcon sx={iconStyle} htmlColor={"#b4b4b4"} />}
            action={() => {
              window.location.assign("/-/_new");
            }}
          />
          <OptionCard
            title="Gallery"
            description="Browse the gallery of example Tynes"
            icon={<CollectionsBookmarkIcon sx={iconStyle} htmlColor={"#26BFAD"} />}
            action={showGallery}
          />
        </Stack>
      </DialogContent>
    </NeptyneDialog>
  );
};
