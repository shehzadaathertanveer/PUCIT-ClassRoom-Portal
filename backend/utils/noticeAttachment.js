/**
 * Notice attachment hardening.
 *
 * Attachments are uploaded straight from the browser to Cloudinary, so the
 * backend never sees the file. That means the URL stored on a notice is
 * attacker-controlled input: without validation a teacher could point every
 * student at an arbitrary host (phishing, tracking, or an intranet endpoint),
 * and a non-https or `javascript:` URL would end up rendered in an anchor.
 *
 * We therefore only accept URLs that look like Cloudinary delivery URLs, and we
 * normalise the metadata so the frontend never has to guess. Existing legacy
 * attachments are left readable by the frontend, which falls back gracefully.
 */

const CLOUDINARY_UPLOAD_RE =
  /^(https:\/\/res\.cloudinary\.com\/)([a-zA-Z0-9_-]+)\/(image|raw|video|auto|multi)\/upload\/(.+)$/;

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'];
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'oga'];

const MAX_URL_LENGTH = 2048;
const MAX_FILE_NAME_LENGTH = 180;

// Decoded once so percent-encoded traversal (%2e%2e%2f) is caught too, but a
// plain "a..b" segment is not mistaken for an attack.
const hasTraversal = (value) => {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return true; // malformed percent-encoding is not a URL we want to store
  }
  return decoded.split('/').some((segment) => segment === '..' || segment === '.');
};

const extensionOf = (fileName = '') => {
  const clean = String(fileName).split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

/**
 * @returns {{ ok: true, attachment: object } | { ok: false, message: string }}
 */
const normaliseNoticeAttachment = (raw) => {
  const empty = { url: '', public_id: '', fileType: '', fileName: '' };

  if (!raw || typeof raw !== 'object') return { ok: true, attachment: empty };

  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) return { ok: true, attachment: empty };

  if (url.length > MAX_URL_LENGTH) {
    return { ok: false, message: 'Attachment URL is too long.' };
  }

  // Only Cloudinary delivery URLs are accepted. This rejects http:// (mixed
  // content), javascript:, data: and any other host.
  if (!CLOUDINARY_UPLOAD_RE.test(url)) {
    return { ok: false, message: 'Attachment must be a Cloudinary upload URL.' };
  }

  // public_id is taken from the URL rather than trusted from the client, so the
  // stored pair can never disagree and later be used to reference a different
  // asset than the one displayed.
  const rest = CLOUDINARY_UPLOAD_RE.exec(url)[4];
  const segments = rest.split('/').filter(Boolean);
  const withoutVersion = segments[0] && /^v\d+$/.test(segments[0]) ? segments.slice(1) : segments;
  const publicId = withoutVersion.join('/');

  if (!publicId || hasTraversal(publicId)) {
    return { ok: false, message: 'Attachment URL does not contain a valid asset id.' };
  }

  let fileName = typeof raw.fileName === 'string' ? raw.fileName.trim() : '';
  fileName = fileName.replace(/[\r\n\t]/g, ' ').slice(0, MAX_FILE_NAME_LENGTH);
  if (!fileName) fileName = publicId.split('/').pop();

  const ext = extensionOf(fileName);
  const declared = typeof raw.fileType === 'string' ? raw.fileType.trim().toLowerCase() : '';

  // The declared type must agree with the extension. A mismatch is how a
  // "PDF" that is really something else would sneak past a preview decision.
  let fileType = '';
  if (IMAGE_EXTS.includes(ext)) fileType = 'image';
  else if (ext === 'pdf') fileType = 'pdf';
  else if (VIDEO_EXTS.includes(ext)) fileType = 'video';
  else if (AUDIO_EXTS.includes(ext)) fileType = 'audio';
  else fileType = 'file';

  if (declared === 'image' && fileType !== 'image') {
    return { ok: false, message: 'Attachment type does not match its file name.' };
  }

  return {
    ok: true,
    attachment: { url, public_id: publicId, fileType, fileName }
  };
};

module.exports = { normaliseNoticeAttachment };
