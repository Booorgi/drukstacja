import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

const ACCEPTED = {
  "model/stl": [".stl"],
  "application/octet-stream": [".stl", ".step", ".stp"],
  "model/step": [".step", ".stp"],
  "text/plain": [".obj"],
};

export default function UploadBox({ onFileSelected }) {
  const [fileName, setFileName] = useState(null);

  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setFileName(file.name);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: "2px dashed #2563eb",
        borderRadius: "12px",
        padding: "3rem 1.5rem",
        textAlign: "center",
        cursor: "pointer",
        background: isDragActive ? "#eff6ff" : "#ffffff",
        transition: "background 0.15s",
      }}
    >
      <input {...getInputProps()} />
      <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        {isDragActive ? "Upusc plik tutaj" : "Przeciagnij i upusc plik tutaj"}
      </p>
      <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
        Typy plikow: .stl, .step, .stp, .obj
      </p>
      {fileName && (
        <p style={{ marginTop: "1rem", color: "#2563eb", fontWeight: 500 }}>
          Wybrano: {fileName}
        </p>
      )}
    </div>
  );
}
