// src/utils/cloudinary.js
import axios from "axios";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const uploadToCloudinary = async (file) => {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary environment variables are missing in your frontend .env file."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  // Optional: Pass original filename so Cloudinary raw/auto storage preserves identity
  formData.append("public_id", `notice_attachments/${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}`);

  try {
    const res = await axios.post(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
      formData,
    );

    const resourceType = res.data.resource_type; // 'image', 'raw', 'video'
    const format = (res.data.format || file.name.split('.').pop()).toLowerCase();
    
    // Check if it's a true browser-renderable image type
    const isImage = resourceType === 'image' && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(format);

    // IMPORTANT: Use Cloudinary's secure_url verbatim. Cloudinary already returns
    // the correct resource-type segment (/image/upload/ vs /raw/upload/). Rewriting
    // it here broke PDF URLs (a /auto/upload PDF is often stored as image type, so
    // forcing /raw/upload/ produced 404 "broken landing page" links).
    return {
      url: res.data.secure_url,
      public_id: res.data.public_id || '',
      fileType: isImage ? 'image' : 'raw', 
      fileName: file.name,
    };
  } catch (err) {
    console.error("Cloudinary upload failed:", err?.response?.data || err.message);
    throw new Error("Failed to upload attachment. Please try again.");
  }
};