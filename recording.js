/* Record the microphone directly. The level meter never feeds the speakers or changes the audio. */
(function (root) {
  'use strict';
  function constraints(noiseReduction = false) {
    return { audio: {
      channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 },
      // Call-oriented processing can make a recording sound rough or pump its volume.
      echoCancellation: { ideal: false }, autoGainControl: { ideal: false },
      noiseSuppression: { ideal: noiseReduction }
    }, video: false };
  }
  async function openMicrophone(noiseReduction = false) {
    try { return await root.navigator.mediaDevices.getUserMedia(constraints(noiseReduction)); }
    catch (error) {
      // Quality preferences must not prevent capture on older devices.
      if (error.name !== 'OverconstrainedError') throw error;
      return root.navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  }
  function createRecorder(stream) {
    const Recorder = root.MediaRecorder;
    const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
    const supported = typeof Recorder.isTypeSupported === 'function' ? types.filter(type => Recorder.isTypeSupported(type)) : [];
    // A higher bitrate avoids low-quality encoder defaults. Some browsers reject bitrate hints.
    for (const mimeType of [...supported, '']) {
      for (const quality of [{ audioBitsPerSecond: 192000 }, {}]) {
        try { return new Recorder(stream, { ...quality, ...(mimeType ? { mimeType } : {}) }); }
        catch (error) { if (!['NotSupportedError', 'TypeError'].includes(error.name)) throw error; }
      }
    }
    throw new Error('This browser could not create an audio recording. Try importing an MP3.');
  }
  function monitor(stream, onLevel) {
    let context, source, analyser, timer, closed = false;
    const stop = () => {
      if (closed) return;
      closed = true; clearInterval(timer);
      source?.disconnect(); analyser?.disconnect();
      if (context && context.state !== 'closed') context.close().catch(() => {});
    };
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) { onLevel(null); return stop; }
      context = new AC(); source = context.createMediaStreamSource(stream); analyser = context.createAnalyser();
      analyser.fftSize = 2048; source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let loudUntil = 0, audibleUntil = Date.now() + 4000;
      timer = setInterval(() => {
        if (context.state !== 'running') { onLevel(null); return; }
        analyser.getFloatTimeDomainData(samples);
        let sum = 0, peak = 0;
        for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
        const rms = Math.sqrt(sum / samples.length), now = Date.now();
        if (peak >= .98) loudUntil = now + 1800;
        if (rms > .008) audibleUntil = now + 4000;
        onLevel({ value: Math.max(0, Math.min(1, (20 * Math.log10(rms || .000001) + 60) / 60)),
          state: now < loudUntil ? 'loud' : now > audibleUntil ? 'quiet' : 'good' });
      }, 200);
      context.resume().catch(() => { stop(); onLevel(null); });
    } catch (_) { stop(); onLevel(null); }
    return stop;
  }
  const api = { constraints, openMicrophone, createRecorder, monitor };
  root.StoryRecording = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
