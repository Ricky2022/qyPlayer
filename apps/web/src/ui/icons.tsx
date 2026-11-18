import type { ReactNode } from "react";

interface IconProps {
  size?: number;
}

function Svg({ size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5v14l11-7z" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </Svg>
);

export const ReplayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z" />
  </Svg>
);

export const VolumeHighIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1c2.9.9 5 3.5 5 6.7s-2.1 5.8-5 6.7v2.1c4-.9 7-4.5 7-8.8s-3-7.9-7-8.8z" />
  </Svg>
);

export const VolumeLowIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z" />
  </Svg>
);

export const VolumeMutedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9v6h4l5 5V4L7 9H3z" />
    <path d="M15.5 9.5 20.5 14.5M20.5 9.5 15.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
  </Svg>
);

export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </Svg>
);

export const ExitFullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
  </Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
  </Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 9h-3a15.7 15.7 0 00-1.2-5.2A8 8 0 0118.9 11zM12 4c.8 1 1.7 3 2 7h-4c.3-4 1.2-6 2-7zM4.1 13h3a15.7 15.7 0 001.2 5.2A8 8 0 014.1 13zm3-2h-3a8 8 0 014.2-5.2A15.7 15.7 0 007.1 11zM12 20c-.8-1-1.7-3-2-7h4c-.3 4-1.2 6-2 7zm2.7-1.8A15.7 15.7 0 0015.9 13h3a8 8 0 01-4.2 5.2z" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z" />
  </Svg>
);
