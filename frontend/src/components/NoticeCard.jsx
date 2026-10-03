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

  const hasAttachment = Boolean(notice.attachment?.url);
  const wasEdited = Boolean(notice.updatedAt && notice.createdAt)
    && new Date(notice.updatedAt).getTime() - new Date(notice.createdAt).getTime() > 1000;

  return (
    <div className={`lm-inset ${compact ? 'p-4' : 'p-4'} space-y-2`}>
      {editing ? (
        <form onSubmit={save} className="space-y-2">
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
            className="lm-field text-xs leading-relaxed resize-y"
          />
          {hasAttachment && (
            <p className="text-[10px] sm:text-xs text-slate-500">
              The attached file is kept as-is.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className={`font-bold text-slate-100 break-words min-w-0 ${compact ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'}`}>
              {notice.title}
            </h4>

            {canManage && (
              <div className="flex gap-1 shrink-0">
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

          <p className="text-slate-300 text-xs leading-relaxed break-words whitespace-pre-wrap">{notice.content}</p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-xs text-slate-500">
            <span className="font-semibold text-slate-400">{notice.authorName || 'Staff'}</span>
            {notice.authorRole && <span className="font-mono uppercase">{notice.authorRole}</span>}
            {notice.createdAt && (
              <span className="font-mono">
                {new Date(notice.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </span>
            )}
            {wasEdited && <span className="font-mono italic">edited</span>}
          </div>

          {hasAttachment && (
            <div className="pt-2">
              <NoticeAttachment attachment={notice.attachment} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NoticeCard;