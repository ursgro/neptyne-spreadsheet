import React, { useCallback, useEffect, useState } from "react";
import { NotebookCellEditor } from "./NotebookCellEditor/NotebookCellEditor";
import authenticatedFetch from "../authenticatedFetch";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import { EditorType } from "../neptyne-sheet/SheetCodeEditor/sheetCodeEditorUtils";
import { Backdrop, CircularProgress, Stack, TextField } from "@mui/material";
import Button from "@mui/material/Button";
import { User } from "../user-context";

interface Execution {
  date: string;
  expression: string;
  result: string;
}

interface CodePanel {
  code_panel: string;
  executions: Execution[];
}

interface TyneCache {
  tyne_id: number;
  tyne_file_name: string;
  codePanels: CodePanel[];
  date: string;
}

interface TyneCacheAPIResponse {
  page: TyneCache[];
  pageSize: number;
  total: number;
}

interface BrowseCacheProps {
  user: User | null;
}

const PageSize = 10;

const formatDateForList = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleString("default", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
};

const BrowseCache: React.FC<BrowseCacheProps> = ({ user }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [tynes, setTynes] = useState<TyneCache[]>([]);
  const [selectedTyneId, setSelectedTyneId] = useState<number | null>(null);
  const [selectedCodePanel, setSelectedCodePanel] = useState<CodePanel | null>(null);
  const [before, setBefore] = useState<string | undefined>();
  const [pageStack, setPageStack] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [total, setTotal] = useState<number>(0);
  const [pageIndex, setPageIndex] = useState<number>(0);

  const pageForward = () => {
    setPageIndex(pageIndex + 1);
    const before = tynes[tynes.length - 1].date;
    setBefore(before);
    setPageStack([...pageStack, before]);
  };

  const pageBack = () => {
    setPageIndex(pageIndex - 1);
    const before = pageStack[pageIndex - 2];
    setBefore(before);
    setPageStack(pageStack.slice(0, -1));
  };

  const searchFileName = (fileName: string) => {
    setFileName(fileName);
    setPageIndex(0);
    setBefore(undefined);
    setPageStack([]);
  };

  const fetchData = useCallback(
    (before: string | undefined, fileName: string, tyneId?: number) => {
      if (user && user.email && user.email.endsWith("@neptyne.com")) {
        const params = new URLSearchParams({ limit: `${PageSize}` });
        if (fileName.length) {
          params.append("file_name", fileName);
        }
        if (before) {
          params.append("before", before);
        }
        setLoading(true);
        authenticatedFetch(
          user,
          `/api/browse_cache/${tyneId || ""}?` + new URLSearchParams(params),
          {
            method: "GET",
          }
        )
          .then((response) => {
            if (response.ok) {
              response.json().then((body: TyneCacheAPIResponse) => {
                body.page.sort((a, b) => b.date.localeCompare(a.date));
                setTynes(body.page);
                setTotal(body.total);
              });
            }
          })
          .finally(() => setLoading(false));
      }
    },
    [user]
  );

  useEffect(() => {
    fetchData(before, fileName);
  }, [before, fetchData, fileName]);

  const handleTyneSelect = (tyne: TyneCache) => {
    setSelectedTyneId(tyne.tyne_id);
    setSelectedCodePanel(null);
    fetchData(before, fileName, tyne.tyne_id);
  };

  const handleCodePanelSelect = (codePanel: CodePanel) => {
    setSelectedCodePanel(codePanel);
  };

  const selectedTyne = tynes.find((tyne) => tyne.tyne_id === selectedTyneId);
  const totalPages = Math.floor(total / PageSize) + 1;

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Box
        width="30%"
        borderRight={1}
        borderColor="divider"
        overflow="auto"
        display="flex"
        flexDirection="column"
      >
        <Backdrop
          sx={{
            color: "#fff",
            zIndex: (theme) => theme.zIndex.drawer + 1,
          }}
          open={loading}
        >
          <CircularProgress color="inherit" />
        </Backdrop>
        <Box sx={{ padding: "10px" }}>
          <SearchBox onSubmit={searchFileName} />
        </Box>

        <Box border={1} borderColor="divider">
          <Box>
            <List component="nav" aria-label="mailbox folders">
              {tynes.map((tyne) => (
                <React.Fragment key={tyne.tyne_id}>
                  <ListItemButton
                    selected={selectedTyneId === tyne.tyne_id}
                    onClick={() => handleTyneSelect(tyne)}
                  >
                    <ListItemText primary={`Tyne: ${tyne.tyne_file_name}`} />
                  </ListItemButton>
                  <Divider />
                  {selectedTyneId &&
                    selectedTyneId === tyne.tyne_id &&
                    selectedTyne && (
                      <List component="div" disablePadding>
                        {selectedTyne.codePanels.map((panel, ix) => (
                          <ListItemButton
                            key={ix}
                            onClick={() => handleCodePanelSelect(panel)}
                            sx={{ pl: 4 }}
                          >
                            <ListItemText
                              primary={`Run at: ${
                                panel.executions.length > 0
                                  ? formatDateForList(panel.executions[0].date)
                                  : "No executions"
                              }`}
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    )}
                </React.Fragment>
              ))}
            </List>
          </Box>
          <Stack direction="row">
            <Button onClick={pageBack} disabled={pageIndex < 1}>
              &lt;
            </Button>
            <Box padding="5px" paddingTop="10px">{`Page ${
              pageIndex + 1
            } of ${totalPages}`}</Box>
            <Button onClick={pageForward} disabled={pageIndex >= totalPages - 1}>
              &gt;
            </Button>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {selectedCodePanel && (
          <Paper elevation={3} sx={{ margin: 2, padding: 2 }}>
            <NotebookCellEditor
              editorType={EditorType.codepane}
              value={selectedCodePanel.code_panel}
              readOnly={true}
              showLineNumbers={true}
              fullHeight={true}
            />
            <List>
              {selectedCodePanel.executions.map((execution, index) => (
                <ListItemButton key={execution.date}>
                  <ListItemText
                    primary={`${execution.expression} => ${execution.result}`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

const SearchBox: React.FC<{ onSubmit: (fileName: string) => void }> = ({
  onSubmit,
}) => {
  const [fileName, setFileName] = useState<string>("");
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(fileName);
  };
  return (
    <form onSubmit={handleSubmit}>
      <TextField
        label="File name"
        value={fileName}
        onChange={(e) => setFileName(e.target.value)}
      />
      <Button type="submit">Search</Button>
      <Button
        onClick={() => {
          setFileName("");
          onSubmit("");
        }}
      >
        Clear
      </Button>
    </form>
  );
};

export default BrowseCache;
