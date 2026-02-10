class HardwareService {
  constructor() {
    this.isElectron = Boolean(window.electronAPI);
  }

  // Check if running in Electron
  checkElectron() {
    if (!this.isElectron) {
      console.warn('Hardware features require Electron environment');
      return false;
    }
    return true;
  }

  // Printer functions
  async getPrinters() {
    if (!this.checkElectron()) {
      return [];
    }
    return window.electronAPI.getPrinters();
  }

  async print(options = {}) {
    if (!this.checkElectron()) {
      // Fallback to browser print
      window.print();
      return { success: true, method: 'browser' };
    }
    return window.electronAPI.print(options);
  }

  async printToPDF(options = {}) {
    if (!this.checkElectron()) {
      throw new Error('PDF printing requires Electron');
    }
    return window.electronAPI.printToPDF(options);
  }

  // Camera functions
  async getCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.error('Failed to enumerate cameras:', err);
      return [];
    }
  }

  async openCamera(videoElement, deviceId = null) {
    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: 'environment' }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoElement) {
        videoElement.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Failed to open camera:', err);
      throw err;
    }
  }

  closeCamera(stream) {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  capturePhoto(videoElement, quality = 0.8) {
    if (!videoElement) {
      throw new Error('Video element required');
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);

    return canvas.toDataURL('image/jpeg', quality);
  }

  // Scanner functions (placeholder - requires native module)
  async getScanners() {
    console.warn('Scanner integration requires additional native modules');
    return [];
  }

  async scan(options = {}) {
    console.warn('Scanner integration requires additional native modules');
    throw new Error('Scanner not available');
  }

  // App info
  async getAppInfo() {
    if (!this.checkElectron()) {
      return {
        version: 'web',
        platform: navigator.platform,
        isDev: true
      };
    }
    return window.electronAPI.getAppInfo();
  }
}

export const hardware = new HardwareService();
