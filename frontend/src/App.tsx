import React, { Component, useMemo } from "react";
import SheetContainer from "./neptyne-container/NeptyneContainer";
import {
  BrowserRouter as Router,
  Navigate,
  Routes,
  Route,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import authenticatedFetch from "./authenticatedFetch";
import { theme } from "./theme";
import { TyneEdit } from "./tyne-edit/TyneEdit";
import { Error as ErrorComponent } from "./Error";

import { CssBaseline } from "@mui/material";
import { GallerySync } from "./tyne-edit/GallerySync";
import posthog from "posthog-js";
import { Capabilities, defaultCapabilities, CapabilitiesContext } from "./capabilities";
import {
  defaultFeatures,
  FeatureFlagsContext,
  posthogFeatureFlags,
} from "./feature-flags";
import { singleUser, User, UserInfoContext } from "./user-context";
import EmailVerification from "./EmailVerification";
import {
  fetchGSheetAuthTokenFromServer,
  fetchOidcTokenFromServer,
} from "./neptyne-container/appsScript";
import GSheetsTutorial from "./GsheetsTutorial";
import BrowseCache from "./notebook/BrowseCache";
import { getGSheetAppConfig, setAuthToken, setOIDCToken } from "./gsheet_app_config";
import GSheetsAdvancedFeatures from "./GSheetsAdvancedFeatures";
import GSheetsButtonSidePanel from "./GSheetsButtonSidePanel";
import ResearchPanel, { GridAndSelection } from "./ResearchPanel";
import { CellChangeWithRowCol } from "./neptyne-sheet/NeptyneSheet";
import { SheetSelection } from "./SheetUtils";
import ErrorBoundary from "./ErrorBoundary";
import { UserViewState } from "./NeptyneProtocol";
import { ViewStateContext } from "./view-state";
import EnvironmentVariables from "./EnvironmentVariables";

require("./App.css");

interface UserState {
  userDataLoaded: boolean;
  user: User | null;
  userHasAppAccess: boolean;
  organizationName?: string;
  error?: string;
}
interface AppState extends UserState {
  capabilities: Capabilities;
  featureFlagsAvailable: boolean;
  gsheetResearchSelection: SheetSelection;
  viewState: UserViewState;
}

type ProtectedRouteProps = UserState & {
  allowAnonymous?: boolean;
  googleOnly?: boolean;
  children?: React.ReactNode;
};

const Protected: React.FC<ProtectedRouteProps> = (props: ProtectedRouteProps) => {
  if (!props.userDataLoaded) {
    return null;
  }
  if (props.error) {
    return <ErrorComponent msg={props.error} />;
  }
  if (!props.user && !props.allowAnonymous) {
    const to = encodeURIComponent(
      window.location.pathname + window.location.search + window.location.hash
    );
    return (
      <Navigate
        to={`/${
          props.googleOnly ? "g" : ""
        }login?redirect=${to}&g=${!!props.googleOnly}`}
        replace
      />
    );
  }
  if (!props.userHasAppAccess && !props.allowAnonymous) {
    return <LoginPage />;
  }
  return <>{props.children}</>;
};

const preventInputShortcuts = (e: KeyboardEvent) => {
  const tagName = (e.target as HTMLElement).tagName;
  const isNativeInput = tagName === "INPUT" || tagName === "TEXTAREA";
  const isCellEditor =
    (e.target as HTMLElement).className.includes("cm-content") &&
    document.getElementById("inner-sheet_container")?.contains(e.target as HTMLElement);
  if (isNativeInput || isCellEditor) {
    e.stopPropagation();
  }
};

export default class App extends Component<{}, AppState> {
  private tokenRefreshCallbackId: number | null = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      userDataLoaded: false,
      user: singleUser,
      userHasAppAccess: false,
      error: undefined,
      capabilities: defaultCapabilities,
      featureFlagsAvailable: false,
      gsheetResearchSelection: getGSheetAppConfig().researchMetadata?.table ?? {
        start: { col: 0, row: 0 },
        end: { col: 0, row: 0 },
      },
      viewState: {},
    };
  }

  fetchUserData = (user: User) => {
    const uri = "/api/users/self";
    return authenticatedFetch(user, uri, {
      forceTokenRefresh: true,
    })
      .then((res) => {
        if (res.ok) {
          return res.json().then((data) => {
            this.setState({
              userHasAppAccess: true,
              capabilities: data.capabilities ?? { ...defaultCapabilities },
              organizationName: data.organization?.name,
              viewState: data.view_state,
            });
          });
        } else if (400 <= res.status && res.status < 500) {
          this.setState({ userHasAppAccess: false });
        } else {
          this.setState({ userHasAppAccess: false, error: res.statusText });
        }
      })
      .catch((e) => {
        this.setState({ userHasAppAccess: false, error: e.message });
      });
  };

  updateViewState = (newState: UserViewState) => {
    this.setState(({ viewState }) => ({
      viewState: Object.assign(viewState, newState),
    }));
    if (!this.state.user) {
      return;
    }
    authenticatedFetch(this.state.user, "/api/users/view_state", {
      method: "PUT",
      body: JSON.stringify(newState),
    }).catch((e) => {
      console.error("Failed to update view state", e);
    });
  };

  componentDidMount() {
    posthog.onFeatureFlags(() => {
      this.setState({ featureFlagsAvailable: true });
    });

    document.addEventListener("keydown", preventInputShortcuts);

    const { inGSMode, poppedOut } = getGSheetAppConfig();

    this.setState({ user: singleUser, userDataLoaded: true, userHasAppAccess: true });

    if (inGSMode) {
      if (!poppedOut) {
        this.tokenRefreshCallbackId = window.setInterval(async () => {
          setOIDCToken(await fetchOidcTokenFromServer());
          setAuthToken(await fetchGSheetAuthTokenFromServer());
        }, 60 * 1000);
      }
    }

    const { sharedSecret: sharedSecretGsheet } = getGSheetAppConfig();

    if (sharedSecretGsheet) {
      sessionStorage.setItem("sharedSecret", sharedSecretGsheet);
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("token")) {
        localStorage.setItem("token", urlParams.get("token")!);
        localStorage.removeItem("sharedSecret");
        urlParams.delete("token");
      } else if (urlParams.has("sharedSecret")) {
        localStorage.setItem("sharedSecret", urlParams.get("sharedSecret")!);
        localStorage.removeItem("token");
        urlParams.delete("sharedSecret");
      }
    }
  }

  componentWillUnmount() {
    this.tokenRefreshCallbackId && window.clearInterval(this.tokenRefreshCallbackId);

    document.removeEventListener("keydown", preventInputShortcuts);
  }

  render() {
    const { user, userDataLoaded, userHasAppAccess } = this.state;

    const { gsWidgetMode, inGSMode, activeSheetId } = getGSheetAppConfig();
    const renderSheetContainer = () => {
      if (gsWidgetMode === "tutorial") {
        return <GSheetsTutorial />;
      } else if (gsWidgetMode === "button-side-panel") {
        return <GSheetsButtonSidePanel />;
      } else if (gsWidgetMode === "environment-variables") {
        return <EnvironmentVariables user={user}></EnvironmentVariables>;
      } else if (user && gsWidgetMode === "research-panel") {
        const gsheetFetchGrid = (sheet: number) => {
          return new Promise<GridAndSelection>((resolve, reject) => {
            google.script.run
              .withSuccessHandler((result) => resolve(result))
              .withFailureHandler((error: any) => reject(error))
              .fetchGrid(sheet);
          });
        };

        const researchMetadata = getGSheetAppConfig().researchMetadata!;

        return (
          <ResearchPanel
            user={user}
            sheet={activeSheetId}
            onClose={null}
            sheetSelection={this.state.gsheetResearchSelection}
            onUpdateSheetSelection={(selection: SheetSelection) => {
              this.setState({ gsheetResearchSelection: selection });
              google.script.run.updateSheetSelection(selection);
            }}
            onUpdateCellValues={(updates: CellChangeWithRowCol[]) =>
              google.script.run.updateCellValues(updates, activeSheetId)
            }
            onShowError={google.script.run.showError}
            fetchGrid={gsheetFetchGrid}
            metaData={researchMetadata}
            onUpdateMetaData={(newValue, prevValue) => {
              google.script.run.updateResearchMetaData(
                activeSheetId,
                newValue,
                prevValue
              );
            }}
          />
        );
      } else if (user && gsWidgetMode === "advanced-features") {
        return (
          <GSheetsAdvancedFeatures
            user={user}
            onClose={() => {
              try {
                google.script.host.close();
              } catch (e) {
                window.close();
              }
            }}
          />
        );
      } else if (!user && inGSMode) {
        return null;
      }

      return (
        <ErrorBoundary>
          <Protected
            user={user}
            userDataLoaded={userDataLoaded}
            userHasAppAccess={userHasAppAccess}
            error={this.state.error}
            allowAnonymous
          >
            <SheetContainerPage
              user={this.state.user}
              organizationName={this.state.organizationName || null}
              hasAppAccess={userHasAppAccess}
              capabilities={this.state.capabilities}
              featureFlagsAvailable={this.state.featureFlagsAvailable}
              viewState={this.state.viewState}
              updateViewState={this.updateViewState}
            />
          </Protected>
        </ErrorBoundary>
      );
    };

    return (
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <>
            <Router>
              <Routes>
                <Route
                  path="/--/gallerysync"
                  element={
                    <Protected
                      user={user}
                      userDataLoaded={userDataLoaded}
                      userHasAppAccess={userHasAppAccess}
                      error={this.state.error}
                    >
                      <GallerySync user={this.state.user} />
                    </Protected>
                  }
                />
                <Route
                  path="/--/tyneedit/:tyneId?"
                  element={
                    <Protected
                      user={user}
                      userDataLoaded={userDataLoaded}
                      userHasAppAccess={userHasAppAccess}
                      error={this.state.error}
                    >
                      <TyneEdit user={this.state.user} />
                    </Protected>
                  }
                />
                <Route path="/neptyne/welcome" element={<RedirectToMain />} />
                <Route path="/-/welcome" element={<RedirectToMain />} />
                <Route
                  path="/-/gallery"
                  element={
                    <Protected
                      user={user}
                      userDataLoaded={userDataLoaded}
                      userHasAppAccess={userHasAppAccess}
                      error={this.state.error}
                      allowAnonymous
                    >
                      <SheetContainerPage
                        user={this.state.user}
                        organizationName={this.state.organizationName || null}
                        hasAppAccess={userHasAppAccess}
                        capabilities={this.state.capabilities}
                        featureFlagsAvailable={this.state.featureFlagsAvailable}
                        viewState={this.state.viewState}
                        updateViewState={this.updateViewState}
                      />
                    </Protected>
                  }
                />
                <Route path="/-/:tyneId?" element={renderSheetContainer()} />
                <Route path="/sheet/:tyneId?" element={<RedirectToSheet />} />
                <Route path="/neptyne/:tyneId?" element={<RedirectToSheet />} />
                <Route path="/login" element={<LoginPage />}></Route>
                <Route path="/glogin" element={<LoginPage />}></Route>
                <Route
                  path={"/--/email-verification"}
                  element={
                    <Protected
                      user={user}
                      userDataLoaded={userDataLoaded}
                      userHasAppAccess={userHasAppAccess}
                      error={this.state.error}
                    >
                      <EmailVerification user={user} />
                    </Protected>
                  }
                />
                <Route
                  path={"/--/browse_cache"}
                  element={
                    <Protected
                      user={user}
                      userDataLoaded={userDataLoaded}
                      userHasAppAccess={userHasAppAccess}
                      error={this.state.error}
                    >
                      <BrowseCache user={user}></BrowseCache>
                    </Protected>
                  }
                />

                {inGSMode ? (
                  <Route path="*" element={renderSheetContainer()} />
                ) : (
                  <Route
                    path="*"
                    element={
                      <Navigate
                        to={{ pathname: "/-/", search: window.location.search }}
                        replace
                      />
                    }
                  ></Route>
                )}
              </Routes>
            </Router>
          </>
        </ThemeProvider>
      </StyledEngineProvider>
    );
  }
}

function SheetContainerPage({
  user,
  organizationName,
  hasAppAccess,
  capabilities,
  featureFlagsAvailable,
  viewState,
  updateViewState,
}: {
  user: User | null;
  organizationName: string | null;
  hasAppAccess: boolean;
  capabilities: Capabilities;
  featureFlagsAvailable: boolean;
  viewState: UserViewState;
  updateViewState: (newState: UserViewState) => void;
}) {
  const { tyneId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const userInfo = useMemo(
    () => ({
      user,
      fetch: authenticatedFetch.bind(null, user),
      organizationName,
    }),
    [organizationName, user]
  );

  return (
    <FeatureFlagsContext.Provider
      value={featureFlagsAvailable ? posthogFeatureFlags : defaultFeatures}
    >
      <CapabilitiesContext.Provider value={capabilities}>
        <UserInfoContext.Provider value={userInfo}>
          <ViewStateContext.Provider value={[viewState, updateViewState]}>
            <SheetContainer
              key={tyneId}
              tyneId={tyneId}
              user={hasAppAccess ? user : null}
              location={location}
              navigate={navigate}
            />
          </ViewStateContext.Provider>
        </UserInfoContext.Provider>
      </CapabilitiesContext.Provider>
    </FeatureFlagsContext.Provider>
  );
}

function RedirectToSheet() {
  const { tyneId } = useParams();

  return <Navigate to={`/-/${tyneId ?? ""}`} replace />;
}

function RedirectToMain() {
  const location = useLocation();

  return <Navigate to={`/-/${location.search}`} replace />;
}

const LoginPage = () => {
  return <h1>Something went wrong! There is no login</h1>;
};
