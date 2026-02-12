import { useState, useRef, useEffect, useCallback } from 'react';

export function useJobCardFormCamera() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDebug, setCameraDebug] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const checkIntervalRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Handle camera stream when video element becomes available
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      setCameraDebug('Assigning stream to video element...');
      videoRef.current.srcObject = streamRef.current;

      // Wait for video to be ready
      let attempts = 0;
      const maxAttempts = 50;

      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }

      checkIntervalRef.current = setInterval(() => {
        attempts++;

        if (!videoRef.current) {
          setCameraDebug(`ERROR: Video ref lost (attempt ${attempts})`);
          clearInterval(checkIntervalRef.current);
          return;
        }

        const width = videoRef.current.videoWidth;
        const height = videoRef.current.videoHeight;

        setCameraDebug(`Checking video... ${width}x${height} (attempt ${attempts}/${maxAttempts})`);

        if (width > 0 && height > 0) {
          setCameraDebug(`Camera ready! ${width}x${height}`);
          setCameraReady(true);
          clearInterval(checkIntervalRef.current);
        } else if (attempts >= maxAttempts) {
          setCameraDebug(`ERROR: Timeout - video dimensions still 0x0 after ${maxAttempts} attempts`);
          clearInterval(checkIntervalRef.current);
          alert('Camera failed to initialize. The video has no dimensions. Try using a different camera or reloading.');
        }
      }, 100);
    }
  }, [cameraActive]);

  const startCamera = useCallback(async () => {
    setCameraDebug('Requesting camera access...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true
      });

      setCameraDebug('Camera stream obtained, waiting for video element...');
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      setCameraDebug(`ERROR: ${err.message}`);
      console.error('Failed to access camera:', err);
      alert('Could not access camera: ' + err.message);
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraReady(false);
    setCameraDebug('');
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !cameraReady) {
      console.warn('Camera not ready for capture');
      return null;
    }

    // Check if video has valid dimensions
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      alert('Camera is not ready yet. Please wait a moment and try again.');
      setCameraReady(false);
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    return { id: Date.now(), data: dataUrl };
  }, [cameraReady]);

  return {
    cameraActive,
    cameraReady,
    cameraDebug,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto
  };
}
