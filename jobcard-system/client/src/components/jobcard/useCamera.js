import { useState, useRef, useEffect, useCallback } from 'react';

export function useCamera() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Camera stream handling
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      const checkVideo = setInterval(() => {
        if (videoRef.current?.videoWidth > 0) {
          setCameraReady(true);
          clearInterval(checkVideo);
        }
      }, 100);
      return () => clearInterval(checkVideo);
    }
  }, [cameraActive]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error('Failed to access camera:', err);
      alert('Could not access camera: ' + err.message);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraReady(false);
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
