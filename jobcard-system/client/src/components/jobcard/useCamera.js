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
      return 'No camera was found on this computer.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is already in use by another program. Close it and try again.';
    default:
      return 'The camera could not be started.';
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

  // Camera stream handling
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
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
  }, [cameraActive]);

  // Always release the camera when this hook unmounts — e.g. the job window is
  // closed while the camera view is still open, without backing out first. The
  // explicit stopCamera() calls only fire on in-view actions, so without this
  // the webcam (and its light) would stay on until the app is refreshed.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // Stop any existing stream before starting a new one
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      const message = describeCameraError(err);
      setCameraError(message);
      toast.error(message);
    }
  }, []);

  const stopCamera = useCallback(() => {
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
