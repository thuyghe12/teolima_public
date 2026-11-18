/**
 * Audio PCM conversion and base64 helper utilities
 */

export function float32ToPcm16(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1.0, 1.0]
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    // Convert to 16-bit signed integer (-32768 to 32767)
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function pcm16ToFloat32(arrayBuffer: ArrayBuffer): Float32Array {
  const view = new DataView(arrayBuffer);
  const numSamples = Math.floor(arrayBuffer.byteLength / 2);
  const float32 = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }
  return float32;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function resampleAudioBuffer(
  inputData: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return inputData;
  }
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputData.length / ratio);
  const result = new Float32Array(outputLength);
  
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const nextIndex = Math.min(index + 1, inputData.length - 1);
    result[i] = inputData[index] * (1 - fraction) + inputData[nextIndex] * fraction;
  }
  return result;
}
