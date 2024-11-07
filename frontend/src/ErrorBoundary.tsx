import React from "react";
import { getGSheetAppConfig } from "./gsheet_app_config";

interface State {
  hasError: boolean;
  error: any;
}

const GENERIC_ERROR_COPY = `Oops. Something went wrong. You can probably keep working by just pressing
the button below. It would be much appreciated if you could send us an email
with the error message below and anything you remember.`;

const GSHEET_ERROR_COPY =
  "Something went wrong. Try closing the sidebar and try again.";

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    const { inGSMode } = getGSheetAppConfig();
    if (this.state.hasError) {
      const error = this.state.error;
      const errorText = error ? error.stack.toString() : "<no stack trace captured>";
      const bodyText = encodeURIComponent(`Error: \n${errorText}`);
      const subjectText = encodeURIComponent("Uncaught error in Neptyne");
      return (
        <div style={{ margin: "15px" }}>
          <p>{inGSMode ? GSHEET_ERROR_COPY : GENERIC_ERROR_COPY}</p>
          {!inGSMode && (
            <button onClick={() => window.location.reload()}>Restore Neptyne</button>
          )}
          &nbsp;
          <a
            href={`mailto:support@neptyne.com?subject=${subjectText}&body=${bodyText}`}
            target="_blank"
            rel="noreferrer"
          >
            Email us.
          </a>
          {error && (
            <p>
              <details>
                <summary>Stack trace</summary>
                <pre>{error.stack}</pre>
              </details>
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
