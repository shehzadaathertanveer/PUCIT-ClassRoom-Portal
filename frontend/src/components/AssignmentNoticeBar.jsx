import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api/axios';

export const useMyAssignments = (enabled = true) => {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await API.get('/assignments/me');
      setAssignments(res.data?.data?.assignments || []);
    } catch (err) {
      console.warn('Could not load assignments:', err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { assignments, loading, refresh };
};

export const remainingTime = (dueAt, now = Date.now()) => {
  const ms = new Date(dueAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'Deadline passed';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`;
};

export const useTick = (interval = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
};

const AssignmentNoticeBar = ({ assignments, roomType, roomId, className = '' }) => {
  const [roomAssignments, setRoomAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const now = useTick();

  useEffect(() => {
    if (assignments || !roomType || !roomId) return undefined;
    let active = true;
    setLoading(true);
    API.get(`/assignments/room/${roomType}/${roomId}`)
      .then((res) => { if (active) setRoomAssignments(res.data?.data?.assignments || []); })
      .catch((err) => console.warn('Could not load room assignments:', err?.response?.data?.message || err.message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assignments, roomType, roomId]);

  const source = assignments || roomAssignments;
  const pending = source.filter((item) => {
    const itemRoomId = item.roomId || item.room?._id || item.room;
    if (roomType && item.roomType !== roomType) return false;
    if (roomId && String(itemRoomId) !== String(roomId)) return false;
    return !item.mySubmission && new Date(item.dueAt).getTime() > now;
  });

  if (!pending.length) return null;

  return (
    <div className={`lm-card border-amber-400/40 bg-amber-950/35 p-3 sm:p-4 space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="lm-badge text-amber-200 border-amber-300/30 bg-amber-300/10">Action Needed</span>
        <p className="text-xs sm:text-sm font-bold text-amber-100">{pending.length} assignment{pending.length > 1 ? 's' : ''} pending</p>
      </div>
      <ul className="space-y-1.5">
        {pending.slice(0, 5).map((item) => (
          <li key={item._id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
            <span className="min-w-0 break-words">
              <strong>{item.title}</strong>
              {item.roomName ? <span className="text-slate-400"> • {item.roomName}</span> : null}
              <span className="ml-2 font-mono text-amber-300">{remainingTime(item.dueAt, now)}</span>
            </span>
            <Link to={`/assignments/${item._id}`} className="lm-btn-ghost !py-1.5 !px-3">View</Link>
          </li>
        ))}
      </ul>
      {loading && <p className="text-[10px] text-slate-400">Loading assignments...</p>}
    </div>
  );
};

export default AssignmentNoticeBar;
