import GSheetAppConfig from "./gsheet_app_config";
import { CellChangeWithRowCol } from "./neptyne-sheet/NeptyneSheet";
import { SheetSelection } from "./SheetUtils";
import { ResearchMetaData } from "./ResearchPanel";

declare global {
  function twq(...args: any[]): void;
  namespace google.script {
    const run: {
      withSuccessHandler(handler: (value: any) => void): RunService;
      withFailureHandler(handler: (reason: any) => void): RunService;
      rerunChangedFunctions(functionNames: string[]): void;
      showError(error: string): void;
      updateCellValues(changes: CellChangeWithRowCol[], sheetId: number): void;
      fetchOidcToken(): void;
      createNeptyneToken(): void;
      hideGSheetFunctionHints(which: "nux" | "all"): void;
      showPackageManagement(): void;
      showSecretsManagement(): void;
      showAdvancedFeatures(): void;
      showTutorial(): void;
      syncTyneMetadata(): void;
      enableBetaFeaturesLDBP(): void;
      fetchGrid(): void;
      updateSheetSelection(selection: SheetSelection): void;
      updateResearchMetaData(
        sheetId: number,
        newValue: ResearchMetaData,
        previousValue: ResearchMetaData
      ): void;
      updateServerInfo(serverUrlBase: string, secret: string): void;
      showEnvironmentVariables(): void;
      getSheetData(): void;
    };
    const host: {
      close(): void;
    };
  }
  interface Window {
    lintrk: (string, any) => void;
    download?: (fmt: string) => void;

    gsheetAppConfig: GSheetAppConfig;

    APP_CONFIG: {
      enableAnalytics: boolean;
      stripePublishableKey: string;
      gitSHA: string;
    };
  }

  const FIREBASE_CONFIGS: string;
}

export {}; // Ensure this is a module.
