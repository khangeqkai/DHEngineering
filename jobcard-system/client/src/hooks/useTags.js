import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

// Simple in-memory cache shared across hook instances
const tagCache = {};
const cacheTimestamps = {};
const CACHE_TTL = 60000; // 1 minute

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

      const data = await api.getTags(category);
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

  // Convert to { value, label } format for dropdowns
  const tags = rawTags.map(t => ({
    value: t.value,
    label: t.name
  }));

  const refresh = useCallback(() => {
    delete tagCache[category];
    delete cacheTimestamps[category];
    setLoading(true);
    fetchTags();
  }, [category, fetchTags]);

  return { tags, rawTags, loading, refresh };
}

/**
 * Invalidate tag cache for a category (call after creating/deleting tags).
 */
export function invalidateTagCache(category) {
  if (category) {
    delete tagCache[category];
    delete cacheTimestamps[category];
  } else {
    // Clear all
    Object.keys(tagCache).forEach(k => {
      delete tagCache[k];
      delete cacheTimestamps[k];
    });
  }
}
