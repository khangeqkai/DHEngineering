import { useState } from 'react';
import { Eye, Printer, Loader2, FileText, Image as ImageIcon, Trash2 } from 'lucide-react';
import { PickCircle } from './paperworkHubHelpers';

// One file line in the paperwork hub: tick to include in the packet, thumbnail,
// name + kind, an optional "For:" picker (drawings / customer property only) that
// ties the file to a part, and the per-row View / Print / Delete buttons.
export default function HubFileRow({
  nameText, subText, isImage, thumb, checked, onToggle,
  viewing, onView, onPrint, printDisabled,
  showOwnerPicker, parts, currentItemId, assigning, onAssign,
  canDelete, deleting, onDelete
}) {
  const FileIcon = isImage ? ImageIcon : FileText;
  // Deleting is permanent, so the bin asks first — right on the row, so the file
  // being removed stays in front of the person while they answer.
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={`hub-file-row${checked ? '' : ' off'}`}>
      <button
        type="button"
        className="hub-row-toggle"
        onClick={onToggle}
        aria-pressed={checked}
        title={checked ? 'Tap to leave out of the packet' : 'Tap to add to the packet'}
      >
        <PickCircle state={checked} />
        <span className="hub-thumb">
          {isImage && thumb ? <img src={thumb} alt="" /> : <FileIcon size={18} />}
        </span>
        <span className="hub-namecell">
          <span className="hub-file-name">{nameText}</span>
          <span className="hub-file-sub">{subText}</span>
        </span>
      </button>

      {showOwnerPicker && (
        <label className="hub-forpick" title="Which part is this file for?">
          <span className="hub-forpick-label">For</span>
          <select
            className="hub-forpick-select"
            value={currentItemId || ''}
            disabled={assigning}
            onChange={(e) => onAssign(e.target.value || null)}
          >
            <option value="">Whole job</option>
            {parts.map(p => (
              <option key={p.id} value={p.id}>
                Part {p.itemNumber}{p.description ? ` — ${p.description.slice(0, 24)}` : ''}
              </option>
            ))}
          </select>
          {assigning && <Loader2 size={13} className="hub-spin" />}
        </label>
      )}

      <div className="hub-row-tools">
        {confirming ? (
          <span className="hub-del-confirm">
            <span className="hub-del-ask">Delete for good?</span>
            <button type="button" className="hub-del-yes" onClick={() => { setConfirming(false); onDelete(); }} disabled={deleting}>
              {deleting ? <Loader2 size={13} className="hub-spin" /> : 'Delete'}
            </button>
            <button type="button" className="hub-del-no" onClick={() => setConfirming(false)} disabled={deleting}>
              Keep
            </button>
          </span>
        ) : (
          <>
            <button type="button" className="hub-icon-btn" onClick={onView} disabled={viewing} title="Preview">
              {viewing ? <Loader2 size={15} className="hub-spin" /> : <Eye size={15} />}
            </button>
            <button type="button" className="hub-icon-btn" onClick={onPrint} disabled={printDisabled} title="Print just this one">
              <Printer size={15} />
            </button>
            {canDelete && (
              <button
                type="button"
                className="hub-icon-btn hub-icon-btn--danger"
                onClick={() => setConfirming(true)}
                disabled={deleting}
                title="Delete this file"
              >
                {deleting ? <Loader2 size={15} className="hub-spin" /> : <Trash2 size={15} />}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
