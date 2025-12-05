import { useEffect } from 'react';

/**
 * Custom hook to handle keyboard shortcuts for video player
 */
export function useKeyboardShortcuts(videoRef, {
  onPlayPause,
  onFullscreen,
  onMute,
  onToggleStats,
  onSeekBackward,
  onSeekForward,
  onVolumeUp,
  onVolumeDown,
  onSwitchLink
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!videoRef.current) return;
      const video = videoRef.current;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          onPlayPause?.();
          break;
        case 'f':
          onFullscreen?.();
          break;
        case 'm':
          onMute?.();
          break;
        case 's':
          onToggleStats?.();
          break;
        case 'arrowleft':
          onSeekBackward?.();
          break;
        case 'arrowright':
          onSeekForward?.();
          break;
        case 'arrowup':
          onVolumeUp?.();
          break;
        case 'arrowdown':
          onVolumeDown?.();
          break;
        case '1':
        case '2':
        case '3':
          const linkNum = parseInt(e.key);
          onSwitchLink?.(linkNum);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    videoRef, 
    onPlayPause,
    onFullscreen,
    onMute,
    onToggleStats,
    onSeekBackward,
    onSeekForward,
    onVolumeUp,
    onVolumeDown,
    onSwitchLink
  ]);
}
