import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api/axios';

const ASSIGNMENT_CACHE_TTL = 60_000;
const assignmentCache = new Map();
const assignmentRequests = new Map();
let cacheEpoch = 0;

const getCachedAssignments = async (key, loader, force = false) => {
  const epoch = cacheEpoch;
  const cached = assignmentCache.get(key);
  if (!force && cached && Date.now() - cached.at < ASSIGNMENT_CACHE_TTL) return cached.data;
  if (assignmentRequests.has(key)) return assignmentRequests.get(key);

  const request = loader()
    .then((data) => {
      if (epoch === cacheEpoch) assignmentCache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      if (assignmentRequests.get(key) === request) assignmentRequests.delete(key);
    });

  assignmentRequests.set(key, request);
  return request;
};

export const invalidateAssignments = () => {
  cacheEpoch += 1;
  assignmentCache.clear();
  assignmentRequests.clear();
};

export const useMyAssignments = (enabled = true, userId = 'shared') => {
  const cacheKey = `/assignments/me:${userId}`;
  const [assignments, setAssignments] = useState(() => assignmentCache.get(cacheKey)?.data || []);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await getCachedAssignments(cacheKey, async () => {
        const res = await API.get('/assignments/me');
        return res.data?.data?.assignments || [];
      }, force);
      setAssignments(data);
    } catch (err) {
      console.warn('Could not load assignments:', err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, cacheKey]);

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

const tickListeners = new Set();
let tickTimer = null;
let sharedNow = Date.now();

export const useTick = (interval = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    tickListeners.add(setNow);
    if (!tickTimer) {
      tickTimer = setInterval(() => {
        sharedNow = Date.now();
        tickListeners.forEach((listener) => listener(sharedNow));
      }, interval);
    }
    return () => {
      tickListeners.delete(setNow);
      if (tickListeners.size === 0 && tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };
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
    const key = `/assignments/room/${roomType}/${roomId}`;
    getCachedAssignments(key, async () => {
      const res = await API.get(key);
      return res.data?.data?.assignments || [];
    })
      .then((data) => { if (active) setRoomAssignments(data); })
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
    <div className={`lm-card border-amber-400/30 bg-amber-950/25 p-3.5 sm:p-4 lg:p-5 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="lm-badge text-amber-200 border-amber-300/30 bg-amber-300/10">Action Needed</span>
        <p className="text-[13px] sm:text-sm font-semibold text-amber-100">{pending.length} assignment{pending.length > 1 ? 's' : ''} pending</p>
      </div>
      <ul className="space-y-2">
        {pending.slice(0, 5).map((item) => (
          <li key={item._id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[13px] leading-relaxed text-slate-200">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <strong>{item.title}</strong>
              {item.roomName ? <span className="text-slate-400"> • {item.roomName}</span> : null}
              <span className="ml-2 font-mono text-amber-300 whitespace-nowrap shrink-0">{remainingTime(item.dueAt, now)}</span>
            </span>
            <Link to={`/assignments/${item._id}`} className="lm-btn-ghost shrink-0 !py-1.5 !px-3">View</Link>
          </li>
        ))}
      </ul>
      {loading && <p className="text-[10px] text-slate-400">Loading assignments...</p>}
    </div>
  );
};

export default AssignmentNoticeBar;
