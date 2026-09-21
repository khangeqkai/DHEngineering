import { useState, useCallback, useEffect, useRef } from 'react';
import { ORDER, MAX_PACKET_FILES, keyOf } from './paperworkHubHelpers';

// Which files (plus the pinned job card) are ticked for the combined packet, and
// the per-section / per-part / whole-job pick-clear helpers the paperwork hub's
// toolbar and "Select" menu use. Extracted out of JobPaperworkHub.jsx (a straight
// lift, no behaviour change) to keep that file under the 600-line house limit —
// this hook only owns the selection bookkeeping; the hub still owns what a tick
// means (print/save) and how it's drawn.
export function usePaperworkSelection(filesByCategory) {
  const [selected, setSelected] = useState(() => new Set());
  const [cardTicked, setCardTicked] = useState(true);
  const seenRef = useRef(new Set());

  // Pre-tick newly-seen files (so the packet starts with everything ticked) while
  // never re-ticking something the user has since unticked.
  useEffect(() => {
    setSelected(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const cat of ORDER) {
        for (const f of filesByCategory[cat] || []) {
          const k = keyOf(cat, f.name);
          if (!seenRef.current.has(k)) {
            seenRef.current.add(k);
            next.add(k);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [filesByCategory]);

  const toggle = useCallback((cat, name) => {
    setSelected(prev => {
      const next = new Set(prev);
      const k = keyOf(cat, name);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const sectionFileKeys = useCallback(
    (cat) => (filesByCategory[cat] || []).map(f => keyOf(cat, f.name)),
    [filesByCategory]
  );

  const sectionState = useCallback((cat) => {
    const keys = sectionFileKeys(cat);
    if (keys.length === 0) return 'empty';
    const picked = keys.filter(k => selected.has(k)).length;
    return picked === 0 ? 'none' : picked === keys.length ? 'all' : 'some';
  }, [sectionFileKeys, selected]);

  const toggleSection = useCallback((cat) => {
    const keys = sectionFileKeys(cat);
    const fullySelected = sectionState(cat) === 'all';
    setSelected(prev => {
      const next = new Set(prev);
      if (fullySelected) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  }, [sectionFileKeys, sectionState]);

  const allFileKeys = useCallback(() => ORDER.flatMap(sectionFileKeys), [sectionFileKeys]);

  // Build the ordered {category, filename} list from the current ticks.
  const selectedItems = useCallback(() => {
    const items = [];
    for (const cat of ORDER) {
      for (const f of filesByCategory[cat] || []) {
        if (selected.has(keyOf(cat, f.name))) items.push({ category: cat, filename: f.name });
      }
    }
    return items;
  }, [filesByCategory, selected]);

  const totalFileCount = allFileKeys().length;
  const totalSelectable = totalFileCount + 1; // + the job card
  const tickedFileCount = selectedItems().length;
  const tickedCount = tickedFileCount + (cardTicked ? 1 : 0);
  const overFileLimit = tickedFileCount > MAX_PACKET_FILES;
  // Whole-job pick state: card + every file, for the master Select all / Clear all.
  const masterState = tickedCount === 0 ? 'none'
    : tickedCount === totalSelectable ? 'all' : 'some';

  const selectAll = useCallback(() => { setCardTicked(true); setSelected(new Set(allFileKeys())); }, [allFileKeys]);
  const clearAll = useCallback(() => { setCardTicked(false); setSelected(new Set()); }, []);
  const toggleMaster = useCallback(() => {
    if (masterState === 'all') clearAll(); else selectAll();
  }, [masterState, clearAll, selectAll]);

  // Every file (across all folders) tied to one part, for the per-part "Select all
  // Part N" option when a job has more than one part.
  const partFileKeys = useCallback((partId) => {
    const keys = [];
    for (const cat of ORDER) {
      for (const f of filesByCategory[cat] || []) {
        if (f.itemId === partId) keys.push(keyOf(cat, f.name));
      }
    }
    return keys;
  }, [filesByCategory]);

  // Pick exactly one part's files (plus the job card, which the packet leads with).
  const selectPart = useCallback((partId) => {
    setCardTicked(true);
    setSelected(new Set(partFileKeys(partId)));
  }, [partFileKeys]);

  // Called when the hub closes — back to the starting state for next time it opens.
  const resetSelection = useCallback(() => {
    seenRef.current = new Set();
    setSelected(new Set());
    setCardTicked(true);
  }, []);

  // Re-tagging a file renames it, so its old key's ticked/unticked state has to
  // carry over to the new name — otherwise the renamed file looks brand-new and
  // gets silently re-ticked, dragging a file the user deliberately excluded back
  // into the packet. Also marks the new name already-seen so the pre-tick effect
  // above leaves it alone. `wasTicked` is read by the caller before the rename's
  // own await, matching what the row showed at the moment the user asked for it.
  const carryTickToRename = useCallback((oldKey, newKey, wasTicked) => {
    seenRef.current.add(newKey);
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(oldKey);
      if (wasTicked) next.add(newKey); else next.delete(newKey);
      return next;
    });
  }, []);

  // Forget a deleted file's tick (and its "already seen" mark, so a later file of
  // the same name is treated as brand-new and pre-ticked again).
  const forgetFile = useCallback((key) => {
    seenRef.current.delete(key);
    setSelected(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  return {
    selected, cardTicked, setCardTicked, toggle,
    sectionFileKeys, sectionState, toggleSection, allFileKeys, selectedItems,
    totalFileCount, totalSelectable, tickedFileCount, tickedCount, overFileLimit, masterState,
    selectAll, clearAll, toggleMaster, partFileKeys, selectPart,
    resetSelection, carryTickToRename, forgetFile
  };
}
