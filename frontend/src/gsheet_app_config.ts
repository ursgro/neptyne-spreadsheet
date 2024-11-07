import { ResearchMetaData } from "./ResearchPanel";

type GSWidgetMode =
  | "secrets-management"
  | "package-management"
  | "tutorial"
  | "advanced-features"
  | "button-side-panel"
  | "research-panel"
  | "organization-billing"
  | "environment-variables"
  | "";

type GSheetFunctionHintsHiddenLevel = null | "nux" | "all";

export interface GSheetAppConfig {
  inGSMode: boolean; // True if gsheet add on, popped out or not
  poppedOut: boolean;
  gsWidgetMode?: GSWidgetMode;
  gsheetId?: string;
  gsheetLocale?: string;
  gsheetTimeZone?: string;
  projectId?: string | null;
  serverUrlBase?: string;
  gsheetFunctionHintsHiddenLevel?: GSheetFunctionHintsHiddenLevel;
  gsheetName?: string;
  authToken?: string;
  oidcToken?: string;
  scriptCodeSHA?: string;
  activeSheetId: number;
  researchMetadata?: ResearchMetaData;
  ownerEmail?: string;
  sharedSecret: string | null;
}

export const getGSheetAppConfig = (): GSheetAppConfig => {
  return (
    window.gsheetAppConfig || {
      inGSMode: false,
      poppedOut: false,
    }
  );
};

export const setOIDCToken = (token: string) => {
  window.gsheetAppConfig.oidcToken = token;
};

export const setAuthToken = (token: string) => {
  window.gsheetAppConfig.authToken = token;
};

export const setGSheetFunctionHintsHiddenLevel = (
  level: GSheetFunctionHintsHiddenLevel
) => {
  window.gsheetAppConfig.gsheetFunctionHintsHiddenLevel = level;
};
