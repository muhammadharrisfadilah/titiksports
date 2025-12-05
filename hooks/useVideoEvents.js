import { useEffect } from 'react';

/**
 * Custom hook to handle video player events
 */
export function useVideoEvents(videoRef, callbacks) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const {
      onPlay,
      onPause, 
      onLoadedMetadata,
      onTimeUpdate,
      onWaiting,
      onCanPlay
    } = callbacks;

    if (onPlay) video.addEventListener('play', onPlay);
    if (onPause) video.addEventListener('pause', onPause);
    if (onLoadedMetadata) video.addEventListener('loadedmetadata', onLoadedMetadata);
    if (onTimeUpdate) video.addEventListener('timeupdate', onTimeUpdate);
    if (onWaiting) video.addEventListener('waiting', onWaiting);
    if (onCanPlay) video.addEventListener('canplay', onCanPlay);

    return () => {
      if (onPlay) video.removeEventListener('play', onPlay);
      if (onPause) video.removeEventListener('pause', onPause);
      if (onLoadedMetadata) video.removeEventListener('loadedmetadata', onLoadedMetadata);
      if (onTimeUpdate) video.removeEventListener('timeupdate', onTimeUpdate);
      if (onWaiting) video.removeEventListener('waiting', onWaiting);
      if (onCanPlay) video.removeEventListener('canplay', onCanPlay);
    };
  }, [videoRef, callbacks]);
}
