export async function computeWaveform(url: string, buckets = 240): Promise<number[] | undefined> {
  try {
    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new Ctx();
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      audioCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / buckets));
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(channelData[start + j] || 0);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    audioCtx.close();
    const maxPeak = Math.max(...peaks, 0.0001);
    return peaks.map((p) => Math.min(1, p / maxPeak));
  } catch {
    return undefined;
  }
}
