// The file <-> base64-text conversions used wherever a picked file goes up to the
// server (as JSON) or a server reply's base64 comes back down to something the
// browser can show or save. One copy of each direction so the same file never
// gets read or decoded two slightly different ways in two places.

// File -> base64 text (no "data:...;base64," prefix). Used before sending a
// picked/captured file to the server as JSON.
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      resolve(String(result).replace(/^data:[^;]*;base64,/, ''));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// base64 text -> raw bytes. Used for a server reply (e.g. a combined-packet PDF)
// that needs to become a downloadable/openable blob.
export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// base64 text -> a Blob of the given type, built on base64ToBytes above.
export function base64ToBlob(base64, mimeType = 'application/pdf') {
  return new Blob([base64ToBytes(base64)], { type: mimeType });
}
