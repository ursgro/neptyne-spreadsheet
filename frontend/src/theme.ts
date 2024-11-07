import { createTheme, PaletteColor } from "@mui/material/styles";
import { Shadows } from "@mui/material/styles/shadows";
import { Palette } from "@mui/material";
import { ZIndex } from "@mui/material/styles/zIndex";
import {
  TypographyOptions,
  TypographyStyleOptions,
} from "@mui/material/styles/createTypography";
import RalewayVariable from "./fonts/raleway-wght.ttf";
import RalewaySemiBoldWoff from "./fonts/raleway-500.woff";
import RalewaySemiBoldWoff2 from "./fonts/raleway-500.woff2";
import RalewayBoldWoff from "./fonts/raleway-600.woff";
import RalewayBoldWoff2 from "./fonts/raleway-600.woff2";
import { getGSheetAppConfig } from "./gsheet_app_config";

interface NeptynePaletteColor extends PaletteColor {
  lightBackground: string;
  lightBorder: string;
  selectedButtonBackground: string;
  selectedButtonBorder: string;
  hover: string;
}

if (getGSheetAppConfig().inGSMode) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css?family=Google+Sans&display=swap";
  document.head.appendChild(link);
}

declare module "@mui/material/styles/" {
  interface Theme {
    palette: Palette & {
      secondary: NeptynePaletteColor;
    };
    typography: TypographyOptions & {
      input: TypographyStyleOptions;
      sheetButton: TypographyStyleOptions;
      tooltipTitle: TypographyStyleOptions;
    };
    zIndex: ZIndex & {
      /**
       * For large content inside grid, e.g. maps, plots and images
       */
      gridPopover: number;

      /**
       * The resize handler squares for widgets
       */
      widgetResize: number;

      /**
       * For contents outside of grid, meant to hide any grid content below itself.
       */
      gridWrapper: number;

      /**
       * For contents meant to be over GRID_WRAPPER.
       */
      gridWrapperPopover: number;
    };
  }
}

const styleOverrides = `
  @font-face {
    font-family: 'Raleway';
    font-display: swap;
    src: local("Raleway"), url("${RalewayVariable}") format("truetype supports variations"), url("${RalewayVariable}") format("truetype-variations") ;
    font-weight: 200 900;
    font-style: normal;
  }
  @font-face {
    font-family: 'Raleway';
    font-display: swap;
    src: local("Raleway-SemiBold"), url("${RalewaySemiBoldWoff2}") format("woff2"), url("${RalewaySemiBoldWoff}") format("woff");
    font-weight: 500;
    font-style: normal;
  }
  @font-face {
    font-family: 'Raleway';
    font-display: swap;
    src: local("Raleway-Bold"), url("${RalewayBoldWoff2}") format("woff2"), url("${RalewayBoldWoff}") format("woff");
    font-weight: 600;
    font-style: normal;
  }
`;

export const fontFamily = getGSheetAppConfig().inGSMode
  ? "Google Sans, Arial, sans-serif"
  : "Raleway, Roboto, Helvetica, Arial, sans-serif";

export const theme = createTheme({
  palette: {
    background: {
      default: "#f8f8f8",
    },
    primary: {
      main: "#2185D0",
    },
    secondary: {
      main: "#26BFAD",
      contrastText: "#fff",

      // @ts-ignore
      lightBorder: "#c0dfde",
      lightBackground: "#e5f1f0",
      selectedButtonBackground: "#c7ebe7",
      selectedButtonBorder: "#a2dddb",
      hover: "#d5e9e7",
    },
    grey: {
      800: "#535353",
    },
    text: {
      primary: "#535353",
      secondary: "#a0a0a0",
    },
  },
  shadows: Array(25).fill("none") as Shadows,
  typography: {
    fontFamily: fontFamily,
    h1: {
      fontSize: "0.875rem",
      fontWeight: 600,
    },
    h2: {
      fontSize: "0.875rem",
      fontWeight: 600,
    },
    h3: {
      fontSize: "0.875rem",
      fontWeight: 600,
    },
    h4: {
      fontSize: "0.875rem",
      fontWeight: 600,
    },
    h5: {
      fontSize: "0.875rem",
      fontWeight: 600,
    },
    h6: {
      fontSize: "0.875rem",
      fontWeight: 500,
    },
    subtitle1: {
      fontSize: "0.875rem",
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: "0.875rem",
      fontWeight: 500,
    },
    body1: {
      fontSize: "0.875rem",
      fontWeight: 500,
    },
    body2: {
      fontSize: "0.875rem",
      fontWeight: 500,
    },
    caption: {
      fontSize: "0.75rem",
      fontWeight: 500,
      lineHeight: 1.1,
    },
    // @ts-ignore
    input: {
      fontSize: "0.875rem",
      lineHeight: 0.875 * 1.15 + "rem",
      fontWeight: 500,
    },
    sheetButton: {
      fontSize: "0.875rem",
      fontWeight: 600,
      lineHeight: "1.4",
    },
    button: {
      fontSize: "0.875rem",
      fontWeight: 600,
      textTransform: "initial",
    },
    tooltipTitle: {
      fontSize: "0.875rem",
      fontWeight: 600,
    },
  },
  zIndex: {
    // @ts-ignore
    gridPopover: 5,
    widgetResize: 7,
    gridWrapper: 10,
    gridWrapperPopover: 11,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides,
    },
  },
});
