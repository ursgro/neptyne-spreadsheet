import InputUnstyled from "@mui/base/InputUnstyled";
import { Backdrop, alpha, styled, Box } from "@mui/material";

export const SearchInput = styled(InputUnstyled)(({ theme }) => ({
  "& .MuiInput-input": {
    width: "100%",
    border: "none",
    backgroundColor: theme.palette.grey[300],
    borderRadius: "5px",
    padding: "7px",
    "&:focus": {
      outline: "none",
    },
  },
}));

export const ShortcutModalBackdrop = styled(Backdrop)(({ theme }) => ({
  zIndex: theme.zIndex.drawer + 1,
}));

export const ShortcutModalBody = styled(Box)(({ theme }) => ({
  width: window.innerWidth > 1000 ? "30vw" : "80vw",
}));

export const SearchBox = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.grey[100],
  borderRadius: "10px",
  padding: "10px",
}));

export const SearchResultBox = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.grey[100],
  borderRadius: "10px",
  paddingBottom: "10px",
}));

export const ItemsListBox = styled(Box)(({ theme }) => ({
  overflowY: "scroll",
  paddingLeft: "10px",
  paddingRight: "10px",
}));

export const ItemBox = styled(Box)(({ theme }) => ({
  padding: "3px",
  borderRadius: "7px",
  cursor: "pointer",
  "&.shortcut-item-active": { backgroundColor: theme.palette.grey[300] },
  "&:hover:not(.shortcut-item-active)": {
    backgroundColor: theme.palette.grey[200],
  },
}));

export const ShortcutBox = styled(Box)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.secondary.main, 0.3),
  color: theme.palette.secondary.main,
  padding: "5px",
  borderRadius: "7px",
}));
