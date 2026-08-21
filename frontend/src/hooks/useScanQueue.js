import { useState, useEffect, useCallback, useRef } from 'react';
import { getScans, updateScanStatus, removeScan, clearAllConflicts, removeScansByRegistrationId } from '../lib/idb';
import { apiCall } from '../services/api';

const MAX_RETRIES = 3;
const BACKOFF_MS = [5000, 15000, 60000];

export const useScanQueue = (token, currentEventId) => {
  const [queue, setQueue] = useState([]);
  const isSyncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    const scans = await getScans();
    setQueue(scans);
  }, []);

  useEffect(() => {
    refreshQueue();
    const interval = setInterval(refreshQueue, 5000);
    return () => clearInterval(interval);
  }, [refreshQueue]);

  const processQueue = useCallback(async () => {
    if (!token || isSyncingRef.current) return;
    isSyncingRef.current = true;
    
    const currentScans = await getScans();
    const pendingScans = currentScans.filter(s => s.status === 'PENDING' || s.status === 'SYNC_FAILED');
    if (pendingScans.length === 0) {
      isSyncingRef.current = false;
      return;
    }

    for (const scan of pendingScans) {
      if (scan.status === 'SYNC_FAILED' && scan.syncAttempts > 0) {
        if (scan.syncAttempts >= MAX_RETRIES) continue;
      }

      try {
        await apiCall(`/events/${scan.eventId}/scan`, {
          method: 'POST',
          body: JSON.stringify({
            token: scan.token,
            stationId: scan.stationId,
            idempotencyKey: scan.id
          })
        });
        
        // Success (or 200 OK idempotent retry)
        await removeScan(scan.id);
        if (scan.registrationId) {
          await removeScansByRegistrationId(scan.registrationId);
        }
      } catch (err) {
        const errorMsg = err.message || '';
        // Same logic as before: Invalid token, expired, or actual conflict
        if (errorMsg.includes('Already checked in') || errorMsg.includes('Invalid QR') || errorMsg.includes('expired') || errorMsg.includes('different event')) {
          await updateScanStatus(scan.id, 'REJECTED_CONFLICT', errorMsg);
        } else {
          await updateScanStatus(scan.id, 'SYNC_FAILED', undefined, true);
        }
      }
    }

    isSyncingRef.current = false;
    refreshQueue();
  }, [queue, token, refreshQueue]);

  useEffect(() => {
    const handleOnline = () => processQueue();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [processQueue]);

  useEffect(() => {
    const interval = setInterval(processQueue, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, [processQueue]);

  const handleClearAllConflicts = useCallback(async () => {
    await clearAllConflicts();
    await refreshQueue();
  }, [refreshQueue]);

  // Filter the UI state so the user only sees queue items and conflicts for the currently active event
  const eventQueue = currentEventId ? queue.filter(s => String(s.eventId) === String(currentEventId)) : queue;
  const conflicts = eventQueue.filter(s => s.status === 'REJECTED_CONFLICT');
  const persistentFailures = eventQueue.filter(s => s.status === 'SYNC_FAILED' && s.syncAttempts >= MAX_RETRIES);

  return { queue: eventQueue, conflicts, persistentFailures, refreshQueue, processQueue, clearAllConflicts: handleClearAllConflicts, removeScansByRegistrationId };
};
