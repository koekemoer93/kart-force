// src/components/AvatarUploader.js
import React, { useState } from "react";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AvatarUploader = ({ currentPhotoURL = "", onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentPhotoURL || "");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const user = auth.currentUser;
    if (!user) return alert("No user is logged in.");

    try {
      setUploading(true);
      const storage = getStorage();
      const fileRef = ref(storage, `users/${user.uid}/profile.jpg`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await updateDoc(doc(db, "users", user.uid), { photoURL: url });
      setPreview(url);
      onUploaded?.(url);
    } catch (err) {
      console.error("Avatar upload failed:", err);
      alert("Failed to upload avatar.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          backgroundImage: `url(${preview || "/avatar-placeholder.png"})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
        aria-label="Profile Avatar"
      />
      <label className="button-secondary" style={{ cursor: "pointer" }}>
        {uploading ? "Uploading..." : "Change Photo"}
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
};

export default AvatarUploader;
