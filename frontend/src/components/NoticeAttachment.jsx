import { useEffect, useState } from 'react';
import { ArrowDownTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

// Cloudinary URLs can be mis-stored with the wrong resource-type segment
// (/image/upload/ vs /raw/upload/) from earlier builds. HEAD-check the stored URL
// and fall back to the sibling segment so already-posted attachments still open
// instead of hitting Cloudinary's broken "landing page".
const resolveUrl = async (url = '') => {
  if (!url) return url;
  const alt = url.includes('/image/upload/')
    ? url.replace('/image/upload/', '/raw/upload/')
    : url.replace('/raw/upload/', '/image/upload/');
  if (alt === url) return url;

  const check = async (u) => {
    try {
      const res = await fetch(u, { method: 'HEAD' });
      return res.ok ? u : null;
    } catch {
      return null;
    }
  };

  return (await check(url)) || (await check(alt)) || url;
};

const NoticeAttachment = ({ attachment, imageClassName = '', linkClassName = '' }) => {
  const { url = '', fileName = '', fileType = '' } = attachment || {};
  const [resolved, setResolved] = useState(url);
  const [imgSrc, setImgSrc] = useState(url);

  useEffect(() => {
    let active = true;
    setResolved(url);
    setImgSrc(url);
    if (!url) return undefined;
    resolveUrl(url).then((u) => {
      if (active) {
        setResolved(u);
        setImgSrc(u);
      }
    });
    return () => { active = false; };
  }, [url]);

  if (!resolved) return null;

  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isImage = fileType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);

  if (isImage) {
    const fallbackSrc = imgSrc.includes('/raw/upload/')
      ? imgSrc.replace('/raw/upload/', '/image/upload/')
      : imgSrc.replace('/image/upload/', '/raw/upload/');
    return (
      <a
        href={resolved}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full min-w-0 lm-inset rounded-xl border border-white/5 p-2 transition-all duration-200 hover:-translate-y-px hover:border-white/15 active:scale-[0.99]"
      >
        <img
          src={imgSrc}
          alt="Attachment"
          className={imageClassName || 'w-full max-h-40 object-cover rounded-lg border border-white/[0.06] bg-slate-950'}
          onError={() => {
            if (fallbackSrc && fallbackSrc !== imgSrc) setImgSrc(fallbackSrc);
          }}
        />
      </a>
    );
  }

  return (
    <div className="lm-inset rounded-xl border border-white/5 p-2.5 flex flex-wrap items-center gap-2 min-w-0">
      {ext && (
        <span className="lm-badge text-orange-200 border-orange-300/25 bg-orange-300/[0.06] font-mono uppercase">
          {ext}
        </span>
      )}
      <a
        href={resolved}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName || 'lm-btn-ghost min-w-0 break-words text-left text-slate-200 hover:text-slate-50'}
      >
        <DocumentTextIcon className="w-4 h-4 shrink-0" />
        <span className="min-w-0 break-words">Open {fileName || 'Document / PDF'}</span>
        <ArrowDownTrayIcon className="w-4 h-4 shrink-0" />
      </a>
    </div>
  );
};

export default NoticeAttachment;