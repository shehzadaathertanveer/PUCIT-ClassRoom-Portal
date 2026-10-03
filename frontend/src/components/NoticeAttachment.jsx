import { ArrowDownTrayIcon, DocumentTextIcon, EyeIcon } from '@heroicons/react/24/outline';

/**
 * Cloudinary delivery URLs for notice attachments.
 *
 * Two problems this solves, both of which used to break real notices:
 *
 * 1. Attachments were uploaded to Cloudinary as `raw`, but some were stored (and
 *    some were re-saved by older builds) with an `/image/upload/` segment. For a
 *    PDF that resolves to the wrong resource, and Cloudinary answers with its
 *    generic landing page instead of the file.
 * 2. `fl_attachment` forces a download rather than inline delivery, so embedding
 *    a PDF either downloaded it or showed nothing at all.
 *
 * Rather than probing the network and hoping, we rebuild the delivery URL
 * deterministically: correct resource type for the file kind, and no
 * attachment-forcing flag. This also means zero extra HTTP requests per
 * attachment, which matters because every notice in a room renders them.
 */

const CLOUDINARY_UPLOAD_RE =
  /^(https?:\/\/res\.cloudinary\.com\/)([^/]+)\/(image|raw|video|auto|multi)\/upload\/(.+)$/i;

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'];
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'oga'];

/** Extension from the file name, lowercased, without the dot. */
export const attachmentExtension = (fileName = '') => {
  const clean = String(fileName).split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

export const formatFileSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Classify an attachment from its declared type first, falling back to the
 * extension. Declared types win because teachers can rename a file to `.pdf`
 * and Cloudinary still holds a video.
 */
export const describeAttachment = (attachment = {}) => {
  const { fileType = '', fileName = '' } = attachment;
  const ext = attachmentExtension(fileName);
  const declared = String(fileType).toLowerCase();

  let kind = 'file';
  if (declared === 'image' || IMAGE_EXTS.includes(ext)) kind = 'image';
  else if (declared === 'video' || VIDEO_EXTS.includes(ext)) kind = 'video';
  else if (declared === 'audio' || AUDIO_EXTS.includes(ext)) kind = 'audio';
  else if (declared === 'pdf' || ext === 'pdf') kind = 'pdf';

  // A PDF is the one non-image kind we can render inline reliably.
  const canPreviewInline = kind === 'image' || kind === 'pdf' || kind === 'video';

  return { ext, kind, canPreviewInline, isPdf: kind === 'pdf', isImage: kind === 'image' };
};

/**
 * Rebuild a Cloudinary upload URL into a URL that actually delivers the file.
 *
 * Anything that is not an HTTPS Cloudinary upload URL returns '' and the
 * component renders nothing. Notices can only be created through
 * uploadToCloudinary, and the backend validates the same allowlist, so a
 * non-Cloudinary value can only be legacy or hand-edited data - rendering it
 * would turn the attachment into a javascript:/data:/plain-http XSS vector.
 */
export const buildDeliveryUrl = (rawUrl, kind = 'file') => {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  const match = CLOUDINARY_UPLOAD_RE.exec(url);
  if (!match) return '';

  const [, , cloudName, , rest] = match;

  // Cloudinary transformations are comma-separated flags in their own path
  // segment ("q_auto,f_jpg"). Drop attachment/download flags and empty out any
  // segment left with nothing, but keep folder segments intact so the public_id
  // (and therefore the file) still resolves.
  const cleaned = rest
    .split('/')
    .map((segment) => {
      if (!segment || segment.startsWith('v') && /^v\d+$/.test(segment)) return segment;
      if (!segment.includes(',')) return segment;
      const flags = segment
        .split(',')
        .filter((f) => f && !/^fl_(attachment|attachment_filename)$/i.test(f));
      return flags.join(',');
    })
    .filter((segment) => segment.length > 0);

  if (!cleaned.length) return '';

  // Images are addressable via /image/, everything else (PDF, docs, archives)
  // must come from /raw/ or Cloudinary serves its landing page instead.
  const resourceType = kind === 'image' ? 'image' : 'raw';

  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${cleaned.join('/')}`;
};

const NoticeAttachment = ({ attachment, imageClassName = '', linkClassName = '', showPreview = true }) => {
  const { url = '', fileName = '', size = '' } = attachment || {};

  const { ext, kind, canPreviewInline, isPdf, isImage } = describeAttachment(attachment);

  // Derived during render: no effect, no HEAD probe, no extra request.
  const deliveryUrl = buildDeliveryUrl(url, kind);

  if (!deliveryUrl) return null;

  const sizeLabel = formatFileSize(size);

  const meta = (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-slate-100 break-words">
        {fileName || (isPdf ? 'Document.pdf' : 'Attachment')}
      </p>
      <p className="text-[10px] sm:text-xs text-slate-400 font-mono">
        {[ext && ext.toUpperCase(), sizeLabel].filter(Boolean).join(' • ') || 'FILE'}
      </p>
    </div>
  );

  if (isImage) {
    return (
      <a
        href={deliveryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full min-w-0 lm-inset rounded-xl border border-white/5 p-2 transition-all duration-200 hover:-translate-y-px hover:border-white/15 active:scale-[0.99]"
      >
        <img
          src={deliveryUrl}
          alt={fileName || 'Notice attachment'}
          loading="lazy"
          className={imageClassName || 'w-full max-h-40 object-cover rounded-lg border border-white/[0.06] bg-slate-950'}
        />
      </a>
    );
  }

  // PDFs render inline. sandbox + no allow-scripts keeps a hostile PDF from
  // reaching the app's origin, and the download link is the escape hatch for
  // viewers where the embed is blocked.
  if (isPdf && showPreview) {
    return (
      <div className="w-full min-w-0 lm-inset rounded-xl border border-white/5 p-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {meta}
          <a
            href={deliveryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName || 'lm-btn-ghost shrink-0'}
          >
            <EyeIcon className="w-4 h-4 shrink-0" />
            Open
            <ArrowDownTrayIcon className="w-4 h-4 shrink-0" />
          </a>
        </div>
        <iframe
          src={deliveryUrl}
          title={fileName || 'Attachment preview'}
          loading="lazy"
          sandbox=""
          referrerPolicy="no-referrer"
          className="w-full h-56 sm:h-72 rounded-lg border border-white/[0.06] bg-slate-950"
        />
      </div>
    );
  }

  return (
    <div className="lm-inset rounded-xl border border-white/5 p-2.5 flex flex-wrap items-center gap-2 min-w-0">
      {ext && (
        <span className="lm-badge text-orange-200 border-orange-300/25 bg-orange-300/[0.06] font-mono uppercase">
          {ext}
        </span>
      )}
      {meta}
      <a
        href={deliveryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName || 'lm-btn-ghost shrink-0'}
      >
        <DocumentTextIcon className="w-4 h-4 shrink-0" />
        Open
        <ArrowDownTrayIcon className="w-4 h-4 shrink-0" />
      </a>
    </div>
  );
};

export default NoticeAttachment;
