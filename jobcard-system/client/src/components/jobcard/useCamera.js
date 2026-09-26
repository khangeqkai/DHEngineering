import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

// Map a getUserMedia failure to a plain explanation the worker can act on
function describeCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow camera permission for this app, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this computer. Use Add to pick a photo from a file instead.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is already in use by another program. Close it and try again.';
    default:
      // Every other branch names a next step; this one has to as well, or the
      // screen simply says no with nowhere to go.
      return 'The camera could not be started. Try again, or use Add to pick a photo from a file.';
  }
}

export function useCamera() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // Bumped every time a genuinely new stream is adopted, even if `cameraActive`
  // was already true (see startCamera) — the attach effect below depends on this
  // too, so a second start still re-attaches instead of being skipped because the
  // boolean it used to depend on alone didn't change.
  const [streamVersion, setStreamVersion] = useState(0);
  // Bumped by stopCamera and by unmount. A startCamera() call captures the value
  // at the moment it begins; if that value has moved on by the time getUserMedia
  // resolves, this start was superseded — Back was pressed, or a newer start
  // began — and the stream it just got is stopped immediately instead of being
  // adopted, which is what used to leave an orphaned camera running.
  const genRef = useRef(0);

  // Camera stream handling
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      // A stream just (re)attached needs its own readiness check — don't keep
      // whatever an earlier stream left behind.
      setCameraReady(false);
      videoRef.current.srcObject = streamRef.current;
      // Poll until the first frame arrives, but give up after ~10s so a stalled
      // device doesn't keep the check running forever — surface the error UI instead.
      let attempts = 0;
      const checkVideo = setInterval(() => {
        if (videoRef.current?.videoWidth > 0) {
          setCameraReady(true);
          clearInterval(checkVideo);
        } else if (++attempts >= 100) {
          clearInterval(checkVideo);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          setCameraActive(false);
          setCameraError('The camera did not start in time. Try again.');
        }
      }, 100);
      return () => clearInterval(checkVideo);
    }
  }, [cameraActive, streamVersion]);

  // Always release the camera when this hook unmounts — e.g. the job window is
  // closed while the camera view is still open, without backing out first. The
  // explicit stopCamera() calls only fire on in-view actions, so without this
  // the webcam (and its light) would stay on until the app is refreshed.
  useEffect(() => {
    return () => {
      genRef.current++;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    const myGen = ++genRef.current;
    try {
      // Stop any existing stream before starting a new one
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Back (or unmount, or another start) happened while this was waiting on
      // the permission prompt/device. The caller has already moved on, so this
      // stream would only ever leak the camera light — shut it down now instead
      // of adopting it.
      if (myGen !== genRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setStreamVersion(v => v + 1);
      setCameraActive(true);
    } catch (err) {
      if (myGen !== genRef.current) return;
      const message = describeCameraError(err);
      setCameraError(message);
      // The camera screen shows this too, so a repeat replaces rather than stacks.
      toast.error(message, { id: 'camera-start-failed' });
    }
  }, []);

  const stopCamera = useCallback(() => {
    genRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraReady(false);
    setCameraError(null);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !cameraReady) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setPhotos(prev => [...prev, { id: Date.now(), data: dataUrl }]);
  }, [cameraReady]);

  const removePhoto = useCallback((photoId) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  }, []);

  return {
    cameraActive,
    cameraReady,
    cameraError,
    photos,
    setPhotos,
    selectedPhoto,
    setSelectedPhoto,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto,
    removePhoto
  };
}
