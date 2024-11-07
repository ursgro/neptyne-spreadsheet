import { Navigate, useParams } from "react-router-dom";
import { fetchForTyne } from "../neptyne-container/fetch-for-tyne";
import { TyneAction } from "../SheetUtils";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RemoteTyne } from "../neptyne-container/NeptyneContainer";
import Button from "@mui/material/Button";
import authenticatedFetch from "../authenticatedFetch";
import { User } from "../user-context";

const GRAY_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdjKC8v/w8ABTMCZXHPohAAAAAASUVORK5CYII=";

interface TyneEditProps {
  user: User | null;
}

export const TyneEdit = ({ user }: TyneEditProps) => {
  let { tyneId } = useParams();

  const [loadedTyne, setLoadedTyne] = useState<RemoteTyne | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const fetchTyne = useCallback(() => {
    if (user) {
      fetchForTyne(user, TyneAction.Open, tyneId, "").then((tyne) => {
        setLoadedTyne(tyne.remoteTyne);
        setSelectedFile(null);
      });
    }
  }, [user, tyneId]);

  useEffect(() => {
    fetchTyne();
  }, [fetchTyne]);

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  if (loadedTyne === null) {
    return <div>Loading...</div>;
  }

  const screenshotHandler = "/api/tyne_screenshot/" + tyneId;

  const handleUploadScreenshot = (file: File) => {
    const formData = new FormData();
    formData.append("screenshot", file);
    return authenticatedFetch(user, screenshotHandler, {
      method: "POST",
      body: formData,
    }).then((response) => {
      if (!response.ok) {
        alert("Error uploading screenshot");
      }
    });
  };

  const handleDeleteScreenshot = () => {
    return authenticatedFetch(user, screenshotHandler, {
      method: "DELETE",
    }).then((response) => {
      if (!response.ok) {
        alert("Error deleting screenshot");
      }
    });
  };

  const screenshotUrl = loadedTyne.screenshot_url;
  return (
    <div>
      <h1>TyneEdit: {loadedTyne.name}</h1>
      <p>{`${user.displayName} (${user.email})`}</p>
      <div>
        <img
          src={
            screenshotUrl ||
            (selectedFile && URL.createObjectURL(selectedFile)) ||
            GRAY_PIXEL
          }
          alt="Screenshot"
          width="400"
          height="300"
        />
        <br />
        <span>{screenshotUrl || ""}</span>
        {!screenshotUrl && (
          <>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(event) => {
                if (event.target.files) {
                  setSelectedFile(event.target.files[0]);
                }
              }}
            />
            <span>{selectedFile ? selectedFile.name : ""}</span>
            <br />
            <Button
              onClick={() => uploadInputRef.current && uploadInputRef.current.click()}
              variant="contained"
            >
              Pick Image
            </Button>
          </>
        )}
        &nbsp;
        <Button
          onClick={() => {
            if (selectedFile) {
              handleUploadScreenshot(selectedFile);
            } else {
              handleDeleteScreenshot();
            }
            fetchTyne();
          }}
          variant="contained"
          disabled={!screenshotUrl && selectedFile === null}
        >
          {screenshotUrl ? "delete" : "upload"}
        </Button>
      </div>
    </div>
  );
};
