import { CircularProgress, Paper } from "@mui/material";
import "./App.css";
import LinterFileUpload from "./LinterFileUpload";
import { FileWithPath } from "react-dropzone";
import React, { useEffect, useState } from "react";
import LintResults, { LintResult } from "./LintResults";
import useDrivePicker from "@fyelci/react-google-drive-picker";
import { authResult } from "@fyelci/react-google-drive-picker/dist/typeDefs";

interface FileResult {
  fileName: string;
  date: Date;
}

type FileResultSuccess = FileResult & LintResult;
type FileResultError = FileResult & { error: string };

const LintError = ({ fileName, error }: FileResultError) => {
  return (
    <div>
      <h1>{fileName}</h1>
      <section className="container">
        <p className="error-result">{error}</p>
      </section>
    </div>
  );
};

const errors: Record<number, string> = {
  415: "Unsupported file type. Please upload a .xlsx file",
  413: "File too large. Please upload something smaller",
};

interface AuthResponse {
  url: string;
  authPayload: authResult;
}

function App() {
  const [results, setResults] = useState<
    (FileResultSuccess | FileResultError)[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [openPicker, authResponse] = useDrivePicker();
  const authResponseRef = React.useRef(authResponse);
  useEffect(() => {
    authResponseRef.current = authResponse;
  });

  const urlParams = new URLSearchParams(window.location.search);
  const debug = !!(
    urlParams.get("includePrompt") ||
    urlParams.get("debug") ||
    ""
  );

  const processFile = async (
    fileOrAuth: FileWithPath | AuthResponse
  ): Promise<FileResultSuccess | FileResultError> => {
    const formData = new FormData();
    let fileName = "";
    if ("url" in fileOrAuth) {
      const { url, authPayload } = fileOrAuth;
      formData.append("url", url);
      formData.append("authPayload", JSON.stringify(authPayload));
    } else {
      fileName = fileOrAuth.name;
      formData.append("file1", fileOrAuth);
    }

    try {
      const response = await fetch("/api/sheet_linter?format=json", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(errors[response.status] || response.statusText);
      }

      const res = await response.json();
      return {
        fileName: fileName,
        date: new Date(),
        jsonResponse: JSON.stringify({ ...res, prompt: undefined }, null, 2),
        ...res,
      };
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : error + "";
      return { fileName: fileName, date: new Date(), error: message };
    }
  };

  const onFileDrop = (files: FileWithPath[]) => {
    setLoading(true);
    if (files.length === 0) {
      setLoading(false);
      return;
    }
    if (files.length > 1) {
      document.title = `Neptyne Sheet Bot - ${files.length} files`;
    } else {
      document.title = `Neptyne Sheet Bot - ${files[0].name
        .split(".")
        .slice(0, -1)
        .join(".")}`;
    }
    Promise.all(files.map((file) => processFile(file)))
      .then((results) =>
        setResults((prevResults) => [...results, ...prevResults])
      )
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <Paper
        elevation={3}
        style={{
          padding: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
        }}
      >
        <img
          className="logo"
          src="https://app.neptyne.com/img/logo.svg"
          alt="Neptyne Logo"
          style={{ display: "block" }}
        />
        <span
          style={{
            fontSize: "1.5em",
            fontWeight: "bold",
            textAlign: "right",
            position: "absolute",
            right: "20px",
            top: "10px",
          }}
        >
          Sheet Bot
        </span>
      </Paper>
      <Paper elevation={3}>
        <div className="App">
          <div className="description" style={{ textAlign: "left" }}>
            Welcome to <a href="https://neptyne.com">Neptyne</a>'s Sheet Bot.
            This bot is an experiment to see how AI can help finding issues in
            your spreadsheets. You can either drag and drop a .xlsx file below
            or import a Google Sheet. Our AI will then have a look at your
            spreadsheet and tell you if it finds any issues or potential
            improvements.
            <br />
            <br />
            This is still a work in progress and we use the data you upload to
            further refine our model and improve the results. Don't upload
            anything confidential. If you have any feedback about the results or
            suggestions for improvements, please email{" "}
            <a href="mailto:team@neptyne.com">the team</a>.
            <br />
            If you just want to try it, you can{" "}
            <a href="/sample.xlsx">download a sample file</a>
            to test it out.
          </div>
          <hr />
          <div className="description">
            Drop a .xlsx file below to get started
          </div>
          <LinterFileUpload disabled={loading} onFileDrop={onFileDrop} />
        </div>
      </Paper>
      {loading && (
        <Paper
          elevation={3}
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <CircularProgress />
        </Paper>
      )}
      {results &&
        results.map((res) => (
          <Paper key={res.date.toString()} elevation={3}>
            {"error" in res ? (
              <LintError {...res} />
            ) : (
              <LintResults debug={debug} {...res} />
            )}
          </Paper>
        ))}
      <Paper elevation={3} style={{ padding: "20px", marginTop: "20px" }}>
        <footer className="footer">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <a href="https://www.neptyne.com">Home</a> |{" "}
              <a href="https://workspace.google.com/marketplace/app/neptyne_python_for_sheets/891309878867">
                Sheets Add-on
              </a>{" "}
              | <a href="https://www.neptyne.com/blog">Blog</a>
            </div>
            <div>
              <a href="https://www.twitter.com/NeptyneHQ">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="#189982"
                >
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-.139 9.237c.209 4.617-3.234 9.765-9.33 9.765-1.854 0-3.579-.543-5.032-1.475 1.742.205 3.48-.278 4.86-1.359-1.437-.027-2.649-.976-3.066-2.28.515.098 1.021.069 1.482-.056-1.579-.317-2.668-1.739-2.633-3.26.442.246.949.394 1.486.411-1.461-.977-1.875-2.907-1.016-4.383 1.619 1.986 4.038 3.293 6.766 3.43-.479-2.053 1.08-4.03 3.199-4.03.943 0 1.797.398 2.395 1.037.748-.147 1.451-.42 2.086-.796-.246.767-.766 1.41-1.443 1.816.664-.08 1.297-.256 1.885-.517-.439.656-.996 1.234-1.639 1.697z" />
                </svg>
              </a>
              <a href="https://www.youtube.com/channel/UCnd_JSAa0VaDOiJ965QffNQ/featured">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="#189982"
                >
                  <path d="M10 9.333l5.333 2.662-5.333 2.672v-5.334zm14-4.333v14c0 2.761-2.238 5-5 5h-14c-2.761 0-5-2.239-5-5v-14c0-2.761 2.239-5 5-5h14c2.762 0 5 2.239 5 5zm-4 7c-.02-4.123-.323-5.7-2.923-5.877-2.403-.164-7.754-.163-10.153 0-2.598.177-2.904 1.747-2.924 5.877.02 4.123.323 5.7 2.923 5.877 2.399.163 7.75.164 10.153 0 2.598-.177 2.904-1.747 2.924-5.877z" />
                </svg>
              </a>
              <a href="https://dosinga.medium.com/">
                <svg
                  width="24"
                  height="24"
                  xmlns="http://www.w3.org/2000/svg"
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  fill="#189982"
                >
                  <path d="M19 24h-14c-2.761 0-5-2.239-5-5v-14c0-2.761 2.239-5 5-5h14c2.762 0 5 2.239 5 5v14c0 2.761-2.237 4.999-5 5zm.97-5.649v-.269l-1.247-1.224c-.11-.084-.165-.222-.142-.359v-8.998c-.023-.137.032-.275.142-.359l1.277-1.224v-.269h-4.422l-3.152 7.863-3.586-7.863h-4.638v.269l1.494 1.799c.146.133.221.327.201.523v7.072c.044.255-.037.516-.216.702l-1.681 2.038v.269h4.766v-.269l-1.681-2.038c-.181-.186-.266-.445-.232-.702v-6.116l4.183 9.125h.486l3.593-9.125v7.273c0 .194 0 .232-.127.359l-1.292 1.254v.269h6.274z" />
                </svg>
              </a>
              <a href="https://www.linkedin.com/company/neptyne">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="#189982"
                >
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
              <a href="mailto:team@neptyne.com">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="#189982"
                >
                  <path d="M12 12.713l-11.985-9.713h23.971l-11.986 9.713zm-5.425-1.822l-6.575-5.329v12.501l6.575-7.172zm10.85 0l6.575 7.172v-12.501l-6.575 5.329zm-1.557 1.261l-3.868 3.135-3.868-3.135-8.11 8.848h23.956l-8.11-8.848z" />
                </svg>
              </a>
            </div>
          </div>
        </footer>
      </Paper>
    </div>
  );
}

export default App;
