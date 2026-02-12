export default function PhotoModal({ photo, onClose }) {
  if (!photo) return null;

  return (
    <div className="photo-modal" onClick={onClose}>
      <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="photo-modal-close" onClick={onClose}>
          ×
        </button>
        <img src={photo.data} alt="Full size preview" />
      </div>
    </div>
  );
}
