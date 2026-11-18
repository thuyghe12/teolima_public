import { float32ToPcm16, pcm16ToFloat32, arrayBufferToBase64, base64ToArrayBuffer, resampleAudioBuffer } from './pcmUtils';

export class LiveAudioManager {
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  
  private isRecording = false;
  private isMuted = false;
  private nextPlayTime = 0;
  private activeSourceNodes: AudioBufferSourceNode[] = [];
  
  // Callbacks
  public onAudioData?: (base64Pcm16: string) => void;
  public onVolumeUpdate?: (inputVol: number, outputVol: number) => void;
  public onAiSpeakingChange?: (isSpeaking: boolean) => void;
  
  private animFrameId: number | null = null;
  private aiSpeakingTimeout: any = null;

  constructor() {}

  /**
   * Initializes both audio contexts and requests microphone permissions
   */
  public async start(): Promise<boolean> {
    try {
      // 1. Setup Output AudioContext (24000Hz standard for Gemini Live model output)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.outputContext = new AudioCtx({ sampleRate: 24000 });
      if (this.outputContext.state === 'suspended') {
        await this.outputContext.resume();
      }

      this.outputAnalyser = this.outputContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.connect(this.outputContext.destination);

      // 2. Setup Input AudioContext (16000Hz preferred for Gemini Live input)
      this.inputContext = new AudioCtx({ sampleRate: 16000 });
      if (this.inputContext.state === 'suspended') {
        await this.inputContext.resume();
      }

      this.inputAnalyser = this.inputContext.createAnalyser();
      this.inputAnalyser.fftSize = 256;

      // 3. Request Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.inputSource = this.inputContext.createMediaStreamSource(this.mediaStream);
      this.inputSource.connect(this.inputAnalyser);

      // 4. Capture audio chunks using ScriptProcessor
      const bufferSize = 2048;
      this.processor = this.inputContext.createScriptProcessor(bufferSize, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        if (!this.isRecording || this.isMuted) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Ensure 16000Hz
        let targetData = inputData;
        if (this.inputContext && this.inputContext.sampleRate !== 16000) {
          targetData = resampleAudioBuffer(inputData, this.inputContext.sampleRate, 16000);
        }

        // Convert to 16-bit PCM ArrayBuffer
        const pcm16 = float32ToPcm16(targetData);
        const base64 = arrayBufferToBase64(pcm16);

        if (this.onAudioData) {
          this.onAudioData(base64);
        }
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputContext.destination);

      this.isRecording = true;
      this.nextPlayTime = this.outputContext.currentTime;

      // Start volume meter loop
      this.startVolumeMonitoring();

      return true;
    } catch (err) {
      console.error('Failed to initialize audio:', err);
      this.stop();
      return false;
    }
  }

  /**
   * Plays incoming 24kHz PCM16 audio chunks gaplessly
   */
  public playChunk(base64Pcm16: string): void {
    if (!this.outputContext || !this.outputAnalyser) return;

    try {
      if (this.outputContext.state === 'suspended') {
        this.outputContext.resume();
      }

      const pcm16Buffer = base64ToArrayBuffer(base64Pcm16);
      const float32Samples = pcm16ToFloat32(pcm16Buffer);

      if (float32Samples.length === 0) return;

      const audioBuffer = this.outputContext.createBuffer(1, float32Samples.length, 24000);
      audioBuffer.getChannelData(0).set(float32Samples);

      const sourceNode = this.outputContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.outputAnalyser);

      const currentTime = this.outputContext.currentTime;
      // If next scheduled time is in the past, reset to currentTime + small buffer (20ms)
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime + 0.02;
      }

      sourceNode.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      this.activeSourceNodes.push(sourceNode);

      sourceNode.onended = () => {
        const idx = this.activeSourceNodes.indexOf(sourceNode);
        if (idx > -1) {
          this.activeSourceNodes.splice(idx, 1);
        }
        if (this.activeSourceNodes.length === 0 && this.onAiSpeakingChange) {
          this.onAiSpeakingChange(false);
        }
      };

      if (this.onAiSpeakingChange) {
        this.onAiSpeakingChange(true);
        if (this.aiSpeakingTimeout) clearTimeout(this.aiSpeakingTimeout);
        this.aiSpeakingTimeout = setTimeout(() => {
          if (this.activeSourceNodes.length === 0 && this.onAiSpeakingChange) {
            this.onAiSpeakingChange(false);
          }
        }, audioBuffer.duration * 1000 + 200);
      }

    } catch (e) {
      console.error('Error playing audio chunk:', e);
    }
  }

  /**
   * Interruption handler: immediately stops all active output playback
   */
  public interrupt(): void {
    try {
      for (const node of this.activeSourceNodes) {
        try {
          node.stop();
          node.disconnect();
        } catch {
          // ignore already stopped
        }
      }
      this.activeSourceNodes = [];
      if (this.outputContext) {
        this.nextPlayTime = this.outputContext.currentTime;
      }
      if (this.onAiSpeakingChange) {
        this.onAiSpeakingChange(false);
      }
    } catch (err) {
      console.warn('Error during audio interruption:', err);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  private startVolumeMonitoring(): void {
    const inputDataArray = new Uint8Array(128);
    const outputDataArray = new Uint8Array(128);

    const updateVolume = () => {
      let inputVol = 0;
      let outputVol = 0;

      if (this.inputAnalyser && !this.isMuted && this.isRecording) {
        this.inputAnalyser.getByteFrequencyData(inputDataArray);
        let sum = 0;
        for (let i = 0; i < inputDataArray.length; i++) {
          sum += inputDataArray[i];
        }
        inputVol = Math.min(1, (sum / inputDataArray.length) / 100);
      }

      if (this.outputAnalyser && this.activeSourceNodes.length > 0) {
        this.outputAnalyser.getByteFrequencyData(outputDataArray);
        let sum = 0;
        for (let i = 0; i < outputDataArray.length; i++) {
          sum += outputDataArray[i];
        }
        outputVol = Math.min(1, (sum / outputDataArray.length) / 100);
      }

      if (this.onVolumeUpdate) {
        this.onVolumeUpdate(inputVol, outputVol);
      }

      this.animFrameId = requestAnimationFrame(updateVolume);
    };

    this.animFrameId = requestAnimationFrame(updateVolume);
  }

  public stop(): void {
    this.isRecording = false;
    this.interrupt();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.inputContext && this.inputContext.state !== 'closed') {
      this.inputContext.close();
      this.inputContext = null;
    }

    if (this.outputContext && this.outputContext.state !== 'closed') {
      this.outputContext.close();
      this.outputContext = null;
    }
  }
}
