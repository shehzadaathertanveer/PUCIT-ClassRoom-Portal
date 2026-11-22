// src/utils/cloudinary.js
import axios from "axios";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const sanitizeDownloadName = (fileName) => {
  const baseName = String(fileName || 'download').split(/[\\/]/).pop() || 'download';
  return baseName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '%252E')
    .replace(/[^A-Za-z0-9_!\- %]/g, '_')
    .replace(/%(?!252E)/g, '_')
    .trim() || 'download';
};

export const getAttachmentDownloadUrl = (url, fileName) => {
  if (!url) return '';

  const marker = '/upload/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url;

  const prefix = url.slice(0, markerIndex + marker.length);
  const parts = url.slice(markerIndex + marker.length).split('/');
  const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
  const transformEnd = versionIndex >= 0 ? versionIndex : 1;

  if (parts.slice(0, transformEnd).some((part) => part.split(',').some((item) => item === 'fl_attachment' || item.startsWith('fl_attachment:')))) {
    return url;
  }

  const transformation = `fl_attachment:${sanitizeDownloadName(fileName)}`;
  if (versionIndex >= 0) {
    parts.splice(versionIndex, 0, transformation);
  } else if (parts[0] && !parts[0].startsWith('s--')) {
    const existing = parts[0].split(',').filter((part) => part && part !== 'f_auto');
    parts[0] = [...existing, transformation].join(',');
  } else {
    parts.splice(parts[0]?.startsWith('s--') ? 1 : 0, 0, transformation);
  }

  return `${prefix}${parts.join('/')}`;
};

export const uploadToCloudinary = async (file, onProgress) => {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary environment variables are missing in your frontend .env file."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  // Keep the extension in public_id so raw/auto delivery URLs resolve correctly.
  formData.append("public_id", `notice_attachments/${Date.now()}_${file.name}`);

  try {
    const res = await axios.post(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
      formData,
      onProgress ? { onUploadProgress: onProgress } : undefined,
    );

    const resourceType = res.data.resource_type; // 'image', 'raw', 'video'
    const format = (res.data.format || file.name.split('.').pop()).toLowerCase();
    
    // Check if it's a true browser-renderable image type
    const isImage = resourceType === 'image' && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(format);

    // IMPORTANT: Use Cloudinary's secure_url verbatim. Cloudinary already returns
    // the correct resource-type segment (/image/upload/ vs /raw/upload/). Rewriting
    // it here broke PDF URLs (a /auto/upload PDF is often stored as image type, so
    // forcing /raw/upload/ produced 404 "broken landing page" links).
    return {
      url: res.data.secure_url,
      public_id: res.data.public_id || '',
      fileType: isImage ? 'image' : format === 'pdf' ? 'pdf' : 'raw',
      fileName: file.name,
    };
  } catch (err) {
    console.error("Cloudinary upload failed:", err?.response?.data || err.message);
    throw new Error("Failed to upload attachment. Please try again.");
  }
};