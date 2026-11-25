import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Film,
  Music2,
  Play,
  RefreshCw,
  Square,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import type { SoundtrackItem, UserProfileSummary, VideoItem } from '../types';
import { apiFetch, getAuthToken } from '../lib/api';
import { audioEngine, SFX_PRESETS, type SfxPreset } from '../lib/audioEngine';

interface UploadStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfileSummary | null;
  onRequireAuth: () => void;
  onPublished: (video: VideoItem) => void;
}

const CATEGORIES = [
  'Trending',
  'Cars & Night',
  'Dance',
  'Music & Studio',
  'Culinary',
  'Action Sports',
  'Travel',
  'Lifestyle',
];

const SUGGESTED_HASHTAGS = ['fyp', 'cinematic', 'nightlife', 'behindthescenes', 'original', 'studio'];

export function UploadStudioModal({
  isOpen,
  onClose,
  currentUser,
  onRequireAuth,
  onPublished,
}: UploadStudioModalProps) {
  const [sourceMode, setSourceMode] = useState<'camera' | 'gallery'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [maxDuration, setMaxDuration] = useState<15 | 30 | 60>(15);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [cameraError, setCameraError] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(10);

  const [soundtracks, setSoundtracks] = useState<SoundtrackItem[]>([]);
  const [selectedSoundtrack, setSelectedSoundtrack] = useState<SoundtrackItem | null>(null);
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);
  const [selectedSfx, setSelectedSfx] = useState<SfxPreset[]>([]);

  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('fyp cinematic');
  const [category, setCategory] = useState('Trending');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch<{ soundtracks: SoundtrackItem[] }>('/api/soundtracks')
      .then((res) => setSoundtracks(res.soundtracks))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || sourceMode !== 'camera' || previewUrl) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    setCameraError('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API unavailable in this browser. Switch to Gallery Upload.');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Camera access was blocked or no camera is connected. You can upload a video from your gallery.');
        }
      });

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [isOpen, sourceMode, facingMode, previewUrl]);

  useEffect(() => {
    if (!isOpen) {
      audioEngine.stopSoundtrackLoop();
      setPreviewingTrackId(null);
      stopCameraStream();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      audioEngine.stopSoundtrackLoop();
    };
  }, [previewUrl]);

  function stopCameraStream() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
  }

  const handleTogglePreviewTrack = (track: SoundtrackItem) => {
    if (previewingTrackId === track.id) {
      audioEngine.stopSoundtrackLoop();
      setPreviewingTrackId(null);
    } else {
      audioEngine.startSoundtrackLoop(track.synthPreset, track.bpm);
      setPreviewingTrackId(track.id);
      setSelectedSoundtrack(track);
    }
  };

  const handleTriggerSfx = (preset: SfxPreset) => {
    audioEngine.triggerSfx(preset);
    setSelectedSfx((prev) => (prev.includes(preset) ? prev : [...prev, preset].slice(-4)));
  };

  const startRecording = () => {
    const camStream = cameraStreamRef.current;
    if (!camStream) return;

    chunksRef.current = [];
    const mixTracks = audioEngine.getMixStream().getAudioTracks();
    const combinedTracks = [...camStream.getVideoTracks(), ...camStream.getAudioTracks(), ...mixTracks];
    const combinedStream = new MediaStream(combinedTracks);

    const mimeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const supportedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const recorder = supportedMime
      ? new MediaRecorder(combinedStream, { mimeType: supportedMime })
      : new MediaRecorder(combinedStream);

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunksRef.current.push(ev.data);
      }
    };

    recorder.onstop = () => {
      audioEngine.stopSoundtrackLoop();
      setPreviewingTrackId(null);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      const ext = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `velo-recording.${ext}`, { type: blob.type });
      const url = URL.createObjectURL(blob);
      setSelectedFile(file);
      setPreviewUrl(url);
      setIsRecording(false);
    };

    if (selectedSoundtrack) {
      audioEngine.startSoundtrackLoop(selectedSoundtrack.synthPreset, selectedSoundtrack.bpm);
      setPreviewingTrackId(selectedSoundtrack.id);
    }

    recorderRef.current = recorder;
    recorder.start(250);
    setIsRecording(true);
    setRecordSeconds(0);

    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setRecordSeconds(elapsed);
      if (elapsed >= maxDuration) {
        stopRecording();
      }
    }, 250);
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      setDurationSec(Math.max(1, recordSeconds || 3));
    }
  };

  const handleGalleryFile = (file: File | undefined) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(url);
    setUploadError('');
  };

  const resetClip = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setRecordSeconds(0);
    setUploadError('');
  };

  const addSuggestedTag = (tag: string) => {
    const tokens = hashtagsText
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').toLowerCase())
      .filter(Boolean);
    if (!tokens.includes(tag)) {
      setHashtagsText([...tokens, tag].join(' '));
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!selectedFile) {
      setUploadError('Record or select a video clip first.');
      return;
    }

    setUploading(true);
    setUploadError('');
    audioEngine.stopSoundtrackLoop();

    try {
      const formData = new FormData();
      formData.append('video', selectedFile);
      formData.append('caption', caption.trim());
      formData.append('hashtags', hashtagsText);
      formData.append('category', category);
      formData.append('durationSec', String(durationSec));
      if (selectedSoundtrack) {
        formData.append('soundtrackId', selectedSoundtrack.id);
      }
      if (selectedSfx.length > 0) {
        formData.append('sfxTags', JSON.stringify(selectedSfx));
      }

      const headers = new Headers();
      headers.set('X-Requested-With', 'XMLHttpRequest');
      const token = getAuthToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);

      const res = await fetch('/api/videos', {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      onPublished(data.video as VideoItem);
      resetClip();
      setCaption('');
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#070709] flex flex-col lg:items-center lg:justify-center lg:bg-black/85 lg:backdrop-blur-md">
      <div className="w-full h-full lg:h-[90vh] lg:max-w-5xl lg:rounded-2xl lg:border lg:border-white/15 bg-[#0C0C10] flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close upload studio"
              className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-display font-bold text-base text-white">Create Video</h2>
          </div>

          {!previewUrl && (
            <div className="flex items-center gap-1 p-1 bg-[#181820] rounded-xl">
              <button
                type="button"
                onClick={() => setSourceMode('camera')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  sourceMode === 'camera' ? 'bg-[#282834] text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('gallery')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  sourceMode === 'gallery' ? 'bg-[#282834] text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Gallery</span>
              </button>
            </div>
          )}

          {previewUrl && (
            <button
              type="button"
              onClick={resetClip}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white"
            >
              Retake / Replace
            </button>
          )}
        </div>

        {/* Main Studio Grid */}
        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
          {/* Left Stage: Camera / Gallery Dropzone / Video Preview */}
          <div className="lg:col-span-6 relative bg-black flex items-center justify-center min-h-[380px] lg:h-full border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden">
            {previewUrl ? (
              <video
                src={previewUrl}
                controls
                autoPlay
                loop
                playsInline
                onLoadedMetadata={(e) => {
                  const dur = Math.round(e.currentTarget.duration);
                  if (dur > 0 && Number.isFinite(dur)) setDurationSec(dur);
                }}
                className="w-full h-full max-h-[55vh] lg:max-h-full object-contain bg-black"
              />
            ) : sourceMode === 'camera' ? (
              <div className="relative w-full h-full min-h-[380px] flex items-center justify-center bg-[#09090C]">
                {cameraError ? (
                  <div className="p-6 text-center max-w-sm">
                    <Camera className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
                    <p className="text-sm text-zinc-300 mb-4">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => setSourceMode('gallery')}
                      className="px-4 py-2.5 rounded-xl bg-[#FF2E54] text-white text-sm font-semibold"
                    >
                      Upload from gallery instead
                    </button>
                  </div>
                ) : (
                  <>
                    <video
                      ref={liveVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                    />

                    {/* Recording Progress Bar */}
                    {isRecording && (
                      <div className="absolute top-3 inset-x-4 flex flex-col gap-1.5">
                        <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FF2E54] transition-all duration-200"
                            style={{ width: `${Math.min(100, (recordSeconds / maxDuration) * 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono-tabular text-white">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#FF2E54]" />
                            REC {recordSeconds}s
                          </span>
                          <span>{maxDuration}s max</span>
                        </div>
                      </div>
                    )}

                    {/* Camera Controls Overlay */}
                    <div className="absolute top-3 right-3 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={isRecording}
                        onClick={() => setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))}
                        aria-label="Flip camera"
                        className="min-w-[44px] min-h-[44px] rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center text-white disabled:opacity-40"
                      >
                        <RefreshCw className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Duration Selector + Record Trigger */}
                    <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-3">
                      {!isRecording && (
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-black/55 backdrop-blur-md border border-white/10">
                          {([15, 30, 60] as const).map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setMaxDuration(sec)}
                              className={`px-3 py-1 rounded-lg text-xs font-mono-tabular transition-colors ${
                                maxDuration === sec ? 'bg-white text-black font-semibold' : 'text-white/80'
                              }`}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                        className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-black/25 hover:scale-105 active:scale-95 transition-transform"
                      >
                        {isRecording ? (
                          <Square className="w-6 h-6 text-[#FF2E54] fill-[#FF2E54] rounded-xs" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#FF2E54]" />
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleGalleryFile(e.dataTransfer.files?.[0]);
                }}
                className="w-full h-full min-h-[360px] p-8 flex flex-col items-center justify-center text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#181820] border border-white/10 flex items-center justify-center mb-4">
                  <Upload className="w-7 h-7 text-[#FF2E54]" />
                </div>
                <h3 className="font-display font-semibold text-lg text-white mb-1">
                  Upload video from device
                </h3>
                <p className="text-sm text-zinc-400 max-w-xs mb-5">
                  Select an MP4, WebM, or MOV vertical clip up to 50 MB.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) => handleGalleryFile(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl bg-[#FF2E54] hover:bg-[#ff4265] text-white text-sm font-semibold transition-colors"
                >
                  Choose video file
                </button>
              </div>
            )}
          </div>

          {/* Right Panel: Audio Mixer, Caption, Hashtags & Publish */}
          <form
            onSubmit={handlePublish}
            className="lg:col-span-6 p-5 space-y-5 overflow-y-auto pb-safe"
          >
            {/* Soundtrack Library */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Music2 className="w-4 h-4 text-[#00E5CC]" />
                  <span>Add music soundtrack</span>
                </label>
                {selectedSoundtrack && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSoundtrack(null);
                      audioEngine.stopSoundtrackLoop();
                      setPreviewingTrackId(null);
                    }}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    Clear track
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {soundtracks.map((track) => {
                  const isSelected = selectedSoundtrack?.id === track.id;
                  const isPreviewing = previewingTrackId === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-[#1F1F29] border-[#00E5CC]/50'
                          : 'bg-[#15151C] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSoundtrack(track)}
                        className="flex-1 text-left min-w-0 pr-2"
                      >
                        <div className="text-sm font-medium text-white truncate">{track.title}</div>
                        <div className="text-xs text-zinc-400 truncate">
                          {track.artist} · {track.bpm} BPM · {track.category}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePreviewTrack(track)}
                        aria-label={isPreviewing ? `Stop ${track.title}` : `Preview ${track.title}`}
                        className={`min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center transition-colors ${
                          isPreviewing
                            ? 'bg-[#00E5CC] text-black'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {isPreviewing ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sound Effects Pad */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 mb-2">
                <Volume2 className="w-4 h-4 text-[#FF2E54]" />
                <span>Sound effects (tap to preview & attach)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SFX_PRESETS.map((sfx) => {
                  const active = selectedSfx.includes(sfx.id);
                  return (
                    <button
                      key={sfx.id}
                      type="button"
                      onClick={() => handleTriggerSfx(sfx.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                        active
                          ? 'bg-[#FF2E54]/20 border-[#FF2E54]/60 text-white'
                          : 'bg-[#15151C] border-white/10 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {active && <Check className="w-3 h-3 text-[#FF2E54]" />}
                      <span>{sfx.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Caption */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Caption</label>
              <textarea
                rows={3}
                maxLength={300}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Describe your clip..."
                className="w-full bg-[#15151C] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 resize-none"
              />
            </div>

            {/* Hashtags & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Hashtags</label>
                <input
                  type="text"
                  value={hashtagsText}
                  onChange={(e) => setHashtagsText(e.target.value)}
                  placeholder="tokyo nightdrive cinematic"
                  className="w-full bg-[#15151C] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SUGGESTED_HASHTAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addSuggestedTag(tag)}
                      className="text-xs text-zinc-400 hover:text-[#00E5CC] transition-colors"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#15151C] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-white/30"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {uploadError && (
              <p className="text-xs text-[#FF2E54] bg-[#FF2E54]/10 border border-[#FF2E54]/25 rounded-lg px-3 py-2">
                {uploadError}
              </p>
            )}

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="w-full h-12 rounded-xl bg-[#FF2E54] hover:bg-[#ff4265] disabled:opacity-45 text-white font-semibold text-sm transition-colors"
            >
              {uploading ? 'Uploading & processing video...' : 'Publish to Velo'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
