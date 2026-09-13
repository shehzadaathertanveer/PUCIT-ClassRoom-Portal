// src/utils/cloudinary.js
import axios from "axios";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const uploadToCloudinary = async (file) => {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary environment variables are missing in your frontend .env file.",
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  try {
    const res = await axios.post(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
      formData,
    );
    return {
      url: res.data.secure_url,
      fileType: res.data.resource_type, // 'image', 'raw', 'video', etc.
      fileName: file.name,
    };
  } catch (err) {
    console.error("Cloudinary upload failed:", err?.response?.data || err.message);
    throw new Error("Failed to upload attachment. Please try again.");
  }
};