import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';

// Simple in-memory cache shared across hook instances
const tagCache = {};
const cacheTimestamps = {};
const CACHE_TTL = 60000; // 1 minute

// Every mounted useTags(category) instance registers itself here, so a change made
// through tagActions can tell every list showing that category to re-fetch — rather
// than each screen that changes an option having to remember to call something
// itself, which is what invalidateTagCache used to require (and what a screen could
// forget: dropping the cache doesn't refresh a list already on screen).
const subscribers = {};

function subscribe(category, listener) {
  if (!subscribers[category]) subscribers[category] = new Set();
  subscribers[category].add(listener);
  return () => subscribers[category].delete(listener);
}

function notify(category) {
  subscribers[category]?.forEach(listener => listener());
}

function dropCache(category) {
  delete tagCache[category];
  delete cacheTimestamps[category];
}

/**
 * Hook to fetch tags by category from the unified tags API.
 * Returns tags as { value, label } array for dropdowns/checkboxes,
 * plus the raw tag objects for additional metadata.
 *
 * @param {string} category - Tag category: 'treatment', 'material', 'customer_property', 'drawings', 'job_type'
 * @returns {{ tags: Array, rawTags: Array, loading: boolean, refresh: Function }}
 */
export function useTags(category) {
  const [rawTags, setRawTags] = useState(tagCache[category] || []);
  const [loading, setLoading] = useState(!tagCache[category]);

  const fetchTags = useCallback(async () => {
    try {
      // Use cache if fresh
      if (tagCache[category] && Date.now() - (cacheTimestamps[category] || 0) < CACHE_TTL) {
        setRawTags(tagCache[category]);
        setLoading(false);
        return;
      }

      // Fetch archived options too: pickers use the active-only list, but a job that
      // already saved a since-retired value still needs its real name for display.
      const data = await api.getTags(category, true);
      tagCache[category] = data;
      cacheTimestamps[category] = Date.now();
      setRawTags(data);
    } catch (err) {
      // Silent fail — tags will show as empty until next refresh
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Subscribe on mount, unsubscribe on unmount — a tagActions call re-fetches every
  // mounted instance for the affected category(ies) instead of just dropping the
  // cache and leaving whatever's already on screen stale.
  useEffect(() => {
    return subscribe(category, fetchTags);
  }, [category, fetchTags]);

  // Pickers offer active options only. (rawTags may include archived ones, which
  // we keep around purely so labelOf can name a retired value on an existing job.)
  // Memoised on purpose: callers key work off this array's identity. A fresh array
  // every render made CreatableTagSelect's "a changed list starts with nothing
  // highlighted" effect fire on every render, so the arrow-key highlight was wiped
  // the moment it was set and the dropdown could only be worked with the mouse.
  const tags = useMemo(
    () => rawTags.filter(t => !t.archived).map(t => ({ value: t.value, label: t.name })),
    [rawTags]
  );

  // Resolve a stored value to its friendly name, archived included; falls back to
  // the raw value if the option was renamed away entirely.
  const labelOf = (value) => rawTags.find(t => t.value === value)?.name || value;

  const refresh = useCallback(() => {
    dropCache(category);
    setLoading(true);
    fetchTags();
  }, [category, fetchTags]);

  return { tags, rawTags, loading, refresh, labelOf };
}

// The one place every screen that changes a tag goes through — dropping the cache
// and notifying subscribers is what makes a list already on screen catch up, so a
// caller can no longer change an option and forget to say so (see the note on
// `subscribers` above). Each method calls the matching api method, drops that
// category's cache and notifies its subscribers, then returns the api result;
// failures propagate to the caller unchanged so it can show its own toast.
export const tagActions = {
  async create(data) {
    const result = await api.createTag(data);
    dropCache(data.category);
    notify(data.category);
    return result;
  },
  async update(id, data) {
    const result = await api.updateTag(id, data);
    // Usually just the tag's own category — but if this update also carried a new
    // category, both the one it left and the one it moved to need to catch up.
    const categories = new Set(
      Object.keys(tagCache).filter(cat => (tagCache[cat] || []).some(t => t.id === id))
    );
    if (data.category) categories.add(data.category);
    categories.forEach(cat => { dropCache(cat); notify(cat); });
    return result;
  },
  async archive(tag) {
    const result = await api.archiveTag(tag.id);
    dropCache(tag.category);
    notify(tag.category);
    return result;
  },
  async restore(tag) {
    const result = await api.activateTag(tag.id);
    dropCache(tag.category);
    notify(tag.category);
    return result;
  }
};
