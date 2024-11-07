import { Navigate } from "react-router-dom";
import React, { useRef } from "react";
import Button from "@mui/material/Button";
import authenticatedFetch from "../authenticatedFetch";
import { User } from "../user-context";

interface GallerySyncProps {
  user: User | null;
}

export const GallerySync = ({ user }: GallerySyncProps) => {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  const screenshotHandler = "/api/gallery_sync";

  const handleUploadJson = (file: File) => {
    const formData = new FormData();
    formData.append("gallery", file);
    setLoading(true);
    return authenticatedFetch(user, screenshotHandler, {
      method: "POST",
      body: formData,
    }).then((response) => {
      response.text().then((data) => {
        if (!response.ok) {
          data = "Error: " + data;
        }
        setMessage(data);
        setLoading(false);
      });
    });
  };

  return (
    <div>
      <h1>Gallery Sync</h1>
      <p>{`${user.displayName} (${user.email})`}</p>
      <p>
        Upload a json with the gallery info in it to this end point. This will replace
        the current gallery so be careful. The gallery tyne has an export button that
        should produce something in the right format.
      </p>
      {message && <p>{message}</p>}
      <div>
        <>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(event) => {
              if (event.target.files) {
                setSelectedFile(event.target.files[0]);
              }
            }}
          />

          <br />
          <Button
            onClick={() => uploadInputRef.current && uploadInputRef.current.click()}
            variant="contained"
            disabled={loading}
          >
            Select json
          </Button>
        </>
        &nbsp;
        {selectedFile && (
          <Button
            onClick={() => {
              handleUploadJson(selectedFile);
            }}
            variant="contained"
            disabled={loading}
          >
            Upload {selectedFile.name}
          </Button>
        )}
      </div>
    </div>
  );
};
