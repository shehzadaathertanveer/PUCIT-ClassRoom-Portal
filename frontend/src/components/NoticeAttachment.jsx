import { ArrowDownTrayIcon, DocumentTextIcon, EyeIcon } from '@heroicons/react/24/outline';
import { getAttachmentDownloadUrl } from '../utils/cloudinary';

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

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'oga'];

/** Extension from the file name, lowercased, without the dot. */
const attachmentExtension = (fileName = '') => {
  const clean = String(fileName).split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const formatFileSize = (bytes) => {
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
const describeAttachment = (attachment = {}) => {
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
const buildDeliveryUrl = (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  const match = CLOUDINARY_UPLOAD_RE.exec(url);
  if (!match) return '';

  return url.replace(/\/fl_attachment(?:_[^/]*)?(?:\/|$)/i, '/');
};

const NoticeAttachment = ({ attachment, imageClassName = '', linkClassName = '', showPreview = true }) => {
  const { url = '', fileName = '', size = '' } = attachment || {};

  const { ext, isPdf, isImage } = describeAttachment(attachment);

  // Derived during render: no effect, no HEAD probe, no extra request.
  const deliveryUrl = buildDeliveryUrl(url);
  const downloadUrl = getAttachmentDownloadUrl(deliveryUrl, fileName);

  if (!deliveryUrl) return null;

  const sizeLabel = formatFileSize(size);

  const meta = (
    <div className="min-w-0 flex-1">
      <p className="text-[13px] font-semibold text-slate-100 [overflow-wrap:anywhere]">
        {fileName || (isPdf ? 'Document.pdf' : 'Attachment')}
      </p>
      <p className="text-xs font-mono text-slate-400">
        {[ext && ext.toUpperCase(), sizeLabel].filter(Boolean).join(' • ') || 'FILE'}
      </p>
    </div>
  );

  if (isImage && showPreview) {
    return (
      <a
        href={deliveryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] p-1.5 transition-all duration-200 hover:-translate-y-px hover:border-white/20 active:scale-[0.99]"
      >
        <img
          src={deliveryUrl}
          alt={fileName || 'Notice attachment'}
          loading="lazy"
          className={imageClassName || 'w-full max-h-36 rounded-lg bg-slate-950 object-cover'}
        />
      </a>
    );
  }

  if (isImage) {
    return (
      <a
        href={deliveryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition-colors hover:border-white/20"
      >
        <img src={deliveryUrl} alt={fileName || 'Notice attachment'} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg bg-slate-950 object-cover sm:h-12 sm:w-12" />
        {meta}
        <span className="lm-btn-ghost ml-auto shrink-0 px-2.5 py-1.5">
          <EyeIcon className="w-4 h-4 shrink-0" />
          Open
        </span>
      </a>
    );
  }

  // PDFs render inline. sandbox + no allow-scripts keeps a hostile PDF from
  // reaching the app's origin, and the download link is the escape hatch for
  // viewers where the embed is blocked.
  if (isPdf && showPreview) {
    return (
      <div className="w-full min-w-0 space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {meta}
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName || 'lm-btn-ghost ml-auto shrink-0 px-2.5 py-1.5'}
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
          className="h-56 w-full rounded-lg bg-slate-950 sm:h-72"
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition-colors hover:border-white/20">
      {ext && (
        <span className="lm-badge border-white/10 bg-slate-900/60 font-mono text-xs uppercase tracking-wide text-slate-300">
          {ext}
        </span>
      )}
      {meta}
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName || 'lm-btn-ghost ml-auto shrink-0 px-2.5 py-1.5'}
      >
        <DocumentTextIcon className="w-4 h-4 shrink-0" />
        Open
        <ArrowDownTrayIcon className="w-4 h-4 shrink-0" />
      </a>
    </div>
  );
};

export default NoticeAttachment;
