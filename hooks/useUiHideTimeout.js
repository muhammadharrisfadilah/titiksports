import { useEffect } from 'react';

/**
 * Custom hook to handle UI auto-hide timeout
 * @param {React.RefObject} videoRef - Reference to video element
 * @param {boolean} isPlaying - Whether video is playing
 * @param {number} timeout - Timeout in ms before hiding UI
 * @param {function} onHide - Callback when UI should hide
 */
export function useUiHideTimeout(videoRef, isPlaying, timeout, onHide) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isPlaying) return;

    const handleMouseMove = () => {
      onHide(false);
      const timer = setTimeout(() => {
        onHide(true);
      }, timeout);

      return () => clearTimeout(timer);
    };

    video.addEventListener('mousemove', handleMouseMove);
    return () => video.removeEventListener('mousemove', handleMouseMove);
  }, [videoRef, isPlaying, timeout, onHide]);
}
