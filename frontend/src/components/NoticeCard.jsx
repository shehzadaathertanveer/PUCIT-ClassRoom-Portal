import { useState } from 'react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import NoticeAttachment from './NoticeAttachment';

/**
 * One announcement in the notice board.
 *
 * Editing is an inline form rather than a prompt() so the teacher keeps the rest
 * of the board visible while they revise wording. The attachment is not part of
 * the edit form on purpose: re-uploading a file to change a typo is a bad trade,
 * and the backend keeps the existing attachment when the field is omitted.
 */
const NoticeCard = ({ notice, canManage, onEdit, onDelete, busy = false, compact = false }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(notice.title || '');
  const [content, setContent] = useState(notice.content || '');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setTitle(notice.title || '');
    setContent(notice.content || '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setTitle(notice.title || '');
    setContent(notice.content || '');
    setEditing(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSaving(true);
    try {
      await onEdit({ title: title.trim(), content: content.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const hasLegacyAttachment = Boolean(notice.attachment?.url);
  const attachmentList = Array.isArray(notice.attachments)
    ? notice.attachments.filter((item) => item && item.url)
    : [];
  const hasAttachments = attachmentList.length > 0;
  const hasAttachment = hasAttachments || hasLegacyAttachment;
  const wasEdited = Boolean(notice.updatedAt && notice.createdAt)
    && new Date(notice.updatedAt).getTime() - new Date(notice.createdAt).getTime() > 1000;

  return (
    <div className={`lm-inset w-full min-w-0 p-3.5 sm:p-4 lg:p-5 space-y-3 ${compact ? 'border-l-2 border-l-orange-300/50' : 'border-l-2 border-l-slate-500/25'}`}>
      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notice title"
            required
            className="lm-field text-sm font-semibold"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Notice message"
            required
            rows={3}
            className="lm-field min-h-28 resize-y text-sm leading-relaxed"
          />
          {hasAttachment && (
            <p className="text-xs text-slate-400">
              The attached file is kept as-is.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={saving || busy} className="lm-btn">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={cancelEdit} disabled={saving} className="lm-btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h4 className="min-w-0 flex-1 text-sm sm:text-[15px] font-bold leading-snug tracking-tight text-slate-100 [overflow-wrap:anywhere]">
              {notice.title}
            </h4>

            {canManage && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={busy}
                  aria-label="Edit notice"
                  title="Edit notice"
                  className="lm-btn-icon"
                >
                  <PencilSquareIcon className="lm-ico" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete()}
                  disabled={busy}
                  aria-label="Delete notice"
                  title="Delete notice"
                  className="lm-btn-icon hover:!border-rose-400/50 hover:!text-rose-200"
                >
                  <TrashIcon className="lm-ico" />
                </button>
              </div>
            )}
          </div>

          <p className="mt-0.5 max-w-[75ch] whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-slate-200">{notice.content}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-white/[0.06] pt-2.5 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">{notice.authorName || 'Staff'}</span>
            {notice.authorRole && <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide text-slate-400">{notice.authorRole}</span>}
            {notice.createdAt && (
              <span className="font-mono tabular-nums text-slate-500">
                {new Date(notice.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </span>
            )}
            {wasEdited && <span className="font-mono italic text-slate-500">edited</span>}
          </div>

          {hasAttachment && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              {hasAttachments ? (
                <div className={`grid grid-cols-1 gap-2 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
                  {attachmentList.map((item, index) => (
                    <NoticeAttachment
                      key={`${item.public_id || item.url}-${index}`}
                      attachment={item}
                      showPreview={false}
                    />
                  ))}
                </div>
              ) : (
                <NoticeAttachment attachment={notice.attachment} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NoticeCard;