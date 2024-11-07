import ImageList from "@mui/material/ImageList";
import ImageListItem from "@mui/material/ImageListItem";
import ImageListItemBar from "@mui/material/ImageListItemBar";
import {
  DataGrid,
  DataGridProps,
  GridColDef,
  GridRowParams,
  GridValueGetterParams,
} from "@mui/x-data-grid";
import { FunctionComponent, useCallback, useEffect, useMemo, useRef } from "react";
import { TyneListItem } from "../../NeptyneProtocol";
import { OpenTyneTab } from "./OpenDialog";
import { UserAvatar } from "../UserAvatar";
import SettingsIcon from "@mui/icons-material/Settings";
import PaidIcon from "@mui/icons-material/Paid";
import InsightsIcon from "@mui/icons-material/Insights";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import MapIcon from "@mui/icons-material/Map";
import ConstructionIcon from "@mui/icons-material/Construction";
import EmojiPeopleIcon from "@mui/icons-material/EmojiPeople";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import { useState } from "react";
import Chip from "@mui/material/Chip";
import EmojiObjectsIcon from "@mui/icons-material/EmojiObjects";
const DATA_GRID_STYLES = {
  ".MuiDataGrid-columnHeaders": {
    backgroundColor: "grey.100",
    color: "grey.700",
  },
  ".MuiDataGrid-columnHeaders .MuiDataGrid-columnSeparator": {
    display: "none",
  },
  ".MuiDataGrid-cell": {
    color: "grey.700",
  },
  "& .bolder-font": {
    fontWeight: 500,
  },
};

const prettyTimestamp = (date: Date): string => {
  const now = new Date();
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return date.toLocaleTimeString();
  }
  return date.toLocaleDateString();
};

interface LastOpenedAndModified {
  lastOpened?: Date;
  lastModified: Date;
}

const columns: GridColDef[] = [
  {
    field: "name",
    headerName: "Name",
    editable: false,
    flex: 2,
  },
  {
    field: "owner",
    headerName: "Owner",
    editable: false,
    cellClassName: () => "bolder-font",
    flex: 1,
  },
  {
    field: "lastOpened",
    headerName: "Last Opened",
    flex: 1,
    editable: false,
    type: "date",
    valueGetter: (params: GridValueGetterParams) => {
      const { lastModified, lastOpened } = params.row;
      return { lastModified, lastOpened };
    },
    sortComparator: (v1: LastOpenedAndModified, v2: LastOpenedAndModified) => {
      if (v1.lastOpened && v2.lastOpened) {
        return v1.lastOpened.getTime() - v2.lastOpened.getTime();
      } else if (v1.lastOpened === undefined) {
        return -1;
      } else if (v2.lastOpened === undefined) {
        return 1;
      } else {
        return v1.lastModified.getTime() - v2.lastModified.getTime();
      }
    },
    renderCell: (params) => {
      const { lastModified, lastOpened } = params.row;
      const tooltip = (
        <div>
          Modified: {lastModified.toLocaleString()}
          {lastOpened && (
            <>
              <br />
              Opened: {lastOpened.toLocaleString()}
            </>
          )}
        </div>
      );
      return (
        <Tooltip title={tooltip} placement="bottom">
          <div>
            {lastOpened ? prettyTimestamp(lastOpened) : prettyTimestamp(lastModified)}
          </div>
        </Tooltip>
      );
    },
  },
  {
    field: "access",
    headerName: "Access",
    flex: 1,
    editable: false,
  },
];

const IMAGE_LIST_STYLES = {
  margin: 0,
};

const IMAGE_LIST_STYLES_GALLERY_ONLY = {
  ...IMAGE_LIST_STYLES,
  minWidth: 785,
};

const IMAGE_LIST_ITEM_STYLES = {
  width: "250px",
  height: "178.12px",
  backgroundColor: "grey.100",
  borderWidth: "1.5px",
  borderColor: "grey.300", // secondary.main
  borderStyle: "solid",
  "&:hover": {
    backgroundColor: "grey.200",
  },
};

const IMAGE_AVATAR_ITEM_BAR_STYLES = {
  paddingLeft: "5px",
  height: "70px",
  ".MuiImageListItemBar-title": {
    fontWeight: 500,
    fontSize: "15px",
    color: "grey.800",
  },
  ".MuiImageListItemBar-subtitle": {
    fontWeight: 500,
    fontSize: "14px",
    color: "grey.700",
  },
};

const SUBTITLE_TYPOGRAPHY_SX = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  display: "-webkit-box",
  WebkitLineClamp: "2",
  WebkitBoxOrient: "vertical",
  whiteSpace: "initial",
};

const IMAGE_STYLES = { width: 247, height: 124 };

const AVATAR_STYLES = { marginTop: 5, marginRight: 9 };

interface OpenDialogDataViewerProps {
  openTab: OpenTyneTab;
  tynes: TyneListItem[];
  selectedTyneId?: string;
  onTyneIdSelect: (tyneId: string) => void;
  onTyneIdAccept: () => void;
  galleryOnly?: boolean;
}

export const OpenDialogDataViewer: FunctionComponent<OpenDialogDataViewerProps> = (
  props
) =>
  props.openTab === "Gallery" ? <GalleryView {...props} /> : <TableView {...props} />;

interface TableViewProps extends OpenDialogDataViewerProps {}

const TableView: FunctionComponent<TableViewProps> = ({
  tynes,
  openTab,
  onTyneIdSelect,
  onTyneIdAccept,
}) => {
  const dataGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dataGridRef.current) {
      // https://github.com/mui/mui-x/issues/4263
      // DataGridPro has more convenient API, but we don't have it. So here we go:
      const scroller = dataGridRef.current.querySelector(
        ".MuiDataGrid-virtualScroller"
      );
      if (scroller) {
        scroller.scrollTop = 0;
      }
    }
  }, [dataGridRef, openTab]);

  const rows = useMemo(
    () =>
      tynes.map((tyne, idx) => {
        return {
          ...tyne,
          id: idx,
        };
      }),
    [tynes]
  );

  const handleClick: DataGridProps["onRowClick"] = useCallback(
    (params: GridRowParams) => onTyneIdSelect(params.row.fileName),
    [onTyneIdSelect]
  );

  const handleDoubleClick: DataGridProps["onRowDoubleClick"] = useCallback(
    (params: GridRowParams) => {
      onTyneIdSelect(params.row.fileName);
      onTyneIdAccept();
    },
    [onTyneIdSelect, onTyneIdAccept]
  );

  return (
    <DataGrid
      ref={dataGridRef}
      rows={rows}
      columns={columns}
      hideFooter
      onRowClick={handleClick}
      onRowDoubleClick={handleDoubleClick}
      columnVisibilityModel={{
        owner: openTab !== "Authored by me",
        access: openTab !== "Authored by me",
      }}
      initialState={{
        sorting: {
          sortModel: [{ field: "lastOpened", sort: "desc" }],
        },
      }}
      sx={DATA_GRID_STYLES}
    />
  );
};

interface GalleryViewProps extends Omit<OpenDialogDataViewerProps, "openTab"> {}

const catToOrder = (cat: string | undefined) => {
  switch (cat) {
    case "Basics":
      return 0;
    case "Financial models":
    case "Finance":
      return 1;
    case "Generative AI":
      return 1.5;
    case "Data Viz":
      return 2;
    case "Games":
      return 3;
    case "Geo":
      return 4;
    case "Simulation":
      return 5;
    case "Tools":
      return 6;
  }
  return 7;
};

const GalleryView: FunctionComponent<GalleryViewProps> = ({
  tynes,
  selectedTyneId,
  galleryOnly,
  ...rest
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Group the tynes by category
  const categories = tynes.reduce((acc, tyne) => {
    const category = tyne.galleryCategory || "Others";
    acc[category] = acc[category] || [];
    acc[category].push(tyne);
    return acc;
  }, {} as Record<string, TyneListItem[]>);

  // Sort the categories based on the catToOrder function
  const sortedCategories = Object.keys(categories).sort(
    (cat1, cat2) => catToOrder(cat1) - catToOrder(cat2)
  );

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(selectedCategory === category ? null : category);
  };

  const filteredCategories = selectedCategory
    ? { [selectedCategory]: categories[selectedCategory] }
    : categories;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", marginBottom: "10px" }}>
        {sortedCategories.map((category) => (
          <Chip
            key={category}
            label={category}
            onClick={() => handleCategoryClick(category)}
            style={{ fontSize: "18px", margin: "5px" }}
            color={selectedCategory === category ? "primary" : "default"}
          />
        ))}
      </div>
      {sortedCategories.map(
        (category) =>
          filteredCategories[category] && (
            <div key={category}>
              <Typography variant="h6" style={{ fontSize: "20px" }}>
                {category}
              </Typography>
              <ImageList
                sx={galleryOnly ? IMAGE_LIST_STYLES_GALLERY_ONLY : IMAGE_LIST_STYLES}
                gap={15}
                cols={galleryOnly ? 3 : 2}
              >
                {filteredCategories[category].map((tyne) => (
                  <GalleryItem
                    key={tyne.fileName}
                    tyne={tyne}
                    isSelected={tyne.fileName === selectedTyneId}
                    {...rest}
                  />
                ))}
              </ImageList>
            </div>
          )
      )}
    </div>
  );
};

interface GalleryItemProps {
  tyne: TyneListItem;
  isSelected: boolean;
  onTyneIdSelect: (tyneId: string) => void;
  onTyneIdAccept: () => void;
}

const GalleryItem: FunctionComponent<GalleryItemProps> = ({
  tyne,
  isSelected,
  onTyneIdSelect,
  onTyneIdAccept,
}) => {
  const handleClick = useCallback(
    () => onTyneIdSelect(tyne.fileName),
    [tyne, onTyneIdSelect]
  );

  const handleDoubleClick = useCallback(() => {
    onTyneIdSelect(tyne.fileName);
    onTyneIdAccept();
  }, [tyne, onTyneIdSelect, onTyneIdAccept]);

  const styles = useMemo(
    () =>
      isSelected
        ? { ...IMAGE_LIST_ITEM_STYLES, borderColor: "secondary.main" }
        : IMAGE_LIST_ITEM_STYLES,
    [isSelected]
  );

  const catToIcon = (cat: string) => {
    switch (cat) {
      case "Basics":
        return <EmojiPeopleIcon />;
      case "Financial models":
      case "Finance":
        return <PaidIcon />;
      case "Generative AI":
        return <EmojiObjectsIcon />;
      case "Data Viz":
        return <InsightsIcon />;
      case "Games":
        return <SportsEsportsIcon />;
      case "Geo":
        return <MapIcon />;
      case "Simulation":
        return <SettingsIcon />;
      case "Tools":
        return <ConstructionIcon />;
    }
    return <SettingsIcon />;
  };

  const subtitle = tyne.description ?? "By: " + tyne.owner;
  const actionIcon = (
    <div style={AVATAR_STYLES}>
      {tyne.galleryCategory ? (
        catToIcon(tyne.galleryCategory)
      ) : (
        <UserAvatar
          photoURL={tyne.ownerProfileImage}
          color={tyne.ownerColor}
          name={tyne.owner}
        />
      )}
    </div>
  );

  return (
    <ImageListItem onClick={handleClick} onDoubleClick={handleDoubleClick} sx={styles}>
      <img
        src={`${tyne.galleryScreenshotUrl}?w=256&fit=crop&auto=format`}
        srcSet={`${tyne.galleryScreenshotUrl}?w=256&fit=crop&auto=format&dpr=2 2x`}
        alt={tyne.name}
        loading="lazy"
        style={IMAGE_STYLES}
      />
      <ImageListItemBar
        title={tyne.name}
        subtitle={
          <Tooltip title={subtitle} placement="bottom">
            <Typography sx={SUBTITLE_TYPOGRAPHY_SX}>{subtitle}</Typography>
          </Tooltip>
        }
        sx={IMAGE_AVATAR_ITEM_BAR_STYLES}
        position="below"
        actionIcon={actionIcon}
        actionPosition="left"
      />
    </ImageListItem>
  );
};
