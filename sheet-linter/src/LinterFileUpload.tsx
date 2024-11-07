import { FileWithPath, useDropzone } from "react-dropzone";

interface Props {
  onFileDrop: (files: FileWithPath[]) => void;
  disabled?: boolean;
}

const LinterFileUpload = ({ onFileDrop, disabled }: Props) => {
  const { getRootProps, getInputProps } = useDropzone({
    disabled,
    multiple: true,
    onDropAccepted: (acceptedFiles: FileWithPath[]) => {
      const sortedFiles = acceptedFiles.sort((a, b) => {
        const patha = a.path || "";
        return patha.localeCompare(b.path || "");
      });
      onFileDrop(sortedFiles);
    },
  });

  return (
    <section className="container">
      <div
        {...getRootProps({
          className: disabled ? "dropzone-disabled" : "dropzone",
        })}
      >
        <input {...getInputProps()} />
        <p>Drag files here or click to open the file picker</p>
      </div>
    </section>
  );
};

export default LinterFileUpload;
