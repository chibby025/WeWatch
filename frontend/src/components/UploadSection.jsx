import React, { useState } from "react";

const UploadSection = ({ onUpload, isUploading, uploadProgress, uploadError}) => {
    const [selectedFile, setSelectedFile] = useState(null);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            console.log("File selected for upload:", file.name);
            setSelectedFile(file);
            if (uploadError) {
                // Assuming parent component manages uploadError state
                // This component just triggers the upload, parent handles error display
            }
        } else {
            setSelectedFile(null);
        }
    };

    const handleUploadClick = () => {
        if (!selectedFile) {
            alert ("Please select a file first.");
            return;
        }
        // Call the onUpload function passed from RoomPage
        onUpload(selectedFile);
        // Clear the selected file state after intiating upload
        setSelectedFile(null);
        // Reset file input value 
        document.getElementById('fileInput').value=''
    };

    return (
    <div className="upload-section">
      <h3>Upload Media</h3>
      
      {/* File Input */}
      <input 
        type="file" 
        id="fileInput"
        onChange={handleFileChange} 
        accept=".mp4,.avi,.mov,.mkv,.webm" // Restrict file types
        disabled={isUploading} // Disable while uploading
      />
      
      {/* Upload Button */}
      <button 
        onClick={handleUploadClick} 
        disabled={!selectedFile || isUploading}
      >
        {isUploading ? `Uploading... ${uploadProgress}%` : 'Upload'}
      </button>

      {/* Upload Progress (Optional) */}
      {isUploading && (
        <div className="upload-progress">
          <p>Progress: {uploadProgress}%</p>
          {/* You could add a progress bar component here */}
        </div>
      )}

      {/* Upload Error Display */}
      {uploadError && (
        <div className="upload-error">
          <p>Error: {uploadError}</p>
        </div>
      )}
    </div>
  );
};

export default UploadSection;


