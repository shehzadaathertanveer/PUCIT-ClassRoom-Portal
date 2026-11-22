const { v2: cloudinary } = require('cloudinary');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

const configured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (configured) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
}

const stripExtension = (id) => String(id || '').trim().replace(/\.[a-z0-9]+$/i, '');

const publicIdFromUrl = (value) => {
  const url = String(value || '').trim();
  if (!url) return '';
  const match = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|raw|video|auto|multi)\/upload\/(?:v\d+\/)?(.+)$/i.exec(url);
  if (!match) return '';
  let id = match[1].split('?')[0];
  if (id.includes(',')) id = id.split('/').filter((part) => part && !part.includes(',')).join('/');
  return stripExtension(id);
};

const publicIdsFromAttachment = (attachment) => {
  if (!attachment || typeof attachment !== 'object') return [];
  const ids = [];
  const fromUrl = publicIdFromUrl(attachment.url);
  if (fromUrl) ids.push(fromUrl);
  if (attachment.public_id) ids.push(stripExtension(attachment.public_id));
  return [...new Set(ids.filter(Boolean))];
};

const publicIdsFromNotice = (notice) => {
  if (!notice) return [];
  const list = [...(Array.isArray(notice.attachments) ? notice.attachments : [])];
  if (notice.attachment) list.push(notice.attachment);
  return [...new Set(list.flatMap(publicIdsFromAttachment))];
};

const allFileObjects = (root, found = []) => {
  if (!root || typeof root !== 'object') return found;
  if (Array.isArray(root)) {
    for (const item of root) allFileObjects(item, found);
    return found;
  }
  if (publicIdsFromAttachment(root).length) found.push(root);
  for (const [key, value] of Object.entries(root)) {
    if (key === 'file' || key === 'attachment' || key === 'attachments') {
      allFileObjects(value, found);
    } else if (Array.isArray(value)) {
      for (const item of value) allFileObjects(item, found);
    } else {
      allFileObjects(value, found);
    }
  }
  return found;
};

const publicIdsFromMarkDoc = (doc) => allFileObjects(doc).flatMap(publicIdsFromAttachment);

const publicIdsFromMarkRows = (rows, key) => {
  if (!Array.isArray(rows)) return publicIdsFromMarkDoc({ file: rows?.file });
  return rows.flatMap(publicIdsFromMarkDoc);
};

const destroyPublicIds = async (ids) => {
  const clean = [...new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!clean.length) return 0;

  if (!configured) {
    console.warn('Cloudinary cleanup skipped: CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET not configured.');
    return 0;
  }

  let deleted = 0;
  for (let i = 0; i < clean.length; i += 100) {
    const batch = clean.slice(i, i + 100);
    try {
      const result = await cloudinary.api.delete_resources(batch, { resource_type: 'image' });
      deleted += Object.values(result?.deleted || {}).filter((v) => v === 'deleted').length;
    } catch (err) {
      console.warn('Cloudinary image cleanup failed for batch:', err?.message || err);
    }
    try {
      const result = await cloudinary.api.delete_resources(batch, { resource_type: 'raw' });
      deleted += Object.values(result?.deleted || {}).filter((v) => v === 'deleted').length;
    } catch (err) {
      console.warn('Cloudinary raw cleanup failed for batch:', err?.message || err);
    }
  }
  return deleted;
};

const safeDestroyPublicIds = async (ids, stillReferencedIds = []) => {
  const keep = new Set((Array.isArray(stillReferencedIds) ? stillReferencedIds : [stillReferencedIds])
    .flatMap((id) => [String(id || '').trim(), stripExtension(id)])
    .filter(Boolean));
  const candidates = [...new Set((Array.isArray(ids) ? ids : [ids])
    .flatMap((id) => [String(id || '').trim(), stripExtension(id)])
    .filter(Boolean))];
  const toDelete = candidates.filter((id) => !keep.has(id));
  if (!toDelete.length) return 0;
  try {
    return await destroyPublicIds(toDelete);
  } catch (err) {
    console.warn('Cloudinary cleanup failed:', err?.message || err);
    return 0;
  }
};

module.exports = {
  cloudinaryConfigured: configured,
  publicIdFromUrl,
  publicIdsFromAttachment,
  publicIdsFromNotice,
  publicIdsFromMarkDoc,
  publicIdsFromMarkRows,
  destroyPublicIds,
  safeDestroyPublicIds,
};
