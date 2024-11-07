import { useEffect, useMemo, useState } from "react";

import CloudDoneIcon from "@mui/icons-material/CloudDone";
import SyncIcon from "@mui/icons-material/Sync";
import Box, { BoxProps } from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

interface Props extends BoxProps {
  lastSave: Date | null;
}

const relativeTime = (now: Date, date: Date) => {
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  return `a few seconds ago`;
};

export const LastSavedIndicator = (props: Props) => {
  const [now, setNow] = useState(new Date());
  const { lastSave, ...boxProps } = props;

  const relativeLabel = useMemo(() => {
    if (lastSave) {
      return relativeTime(now, lastSave);
    }
    return null;
  }, [now, lastSave]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 5 * 1000);
    return () => clearInterval(interval);
  });

  let Icon: typeof SyncIcon | typeof CloudDoneIcon;
  let label: string;
  if (relativeLabel === null) {
    Icon = SyncIcon;
    label = "saving...";
  } else {
    Icon = CloudDoneIcon;
    label = `saved ${relativeLabel}`;
  }

  return (
    <Tooltip title={lastSave ? lastSave.toISOString() : "saving..."}>
      <Box {...boxProps}>
        <Icon sx={{ transform: "translateY(20%)" }} fontSize="inherit" />
        &nbsp;{label}
      </Box>
    </Tooltip>
  );
};
