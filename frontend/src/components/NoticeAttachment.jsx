import { useEffect, useState } from 'react';

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
      <a href={resolved} target="_blank" rel="noopener noreferrer">
        <img
          src={imgSrc}
          alt="Attachment"
          className={imageClassName || 'max-h-40 rounded-xl border border-slate-800 object-cover'}
          onError={() => {
            if (fallbackSrc && fallbackSrc !== imgSrc) setImgSrc(fallbackSrc);
          }}
        />
      </a>
    );
  }

  return (
    <a
      href={resolved}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName || "inline-flex items-center gap-1.5 text-xs font-mono text-orange-300 bg-orange-950/40 px-3 py-2 rounded-xl border border-orange-500/30 hover:underline"}
    >
      <span>📄</span> Open {fileName || 'Document / PDF'}
    </a>
  );
};

export default NoticeAttachment;