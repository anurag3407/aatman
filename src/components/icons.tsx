import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Hand-drawn-feel line icons. One stroke weight, round joins, no fills. */
function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconCheckin(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 20.2s-7.3-4.4-7.3-9.4A4.1 4.1 0 0 1 12 8.3a4.1 4.1 0 0 1 7.3 2.5c0 5-7.3 9.4-7.3 9.4Z" />
      <path d="M8.2 13h2l1.3-2.6 1.6 4.4 1.2-2.4h1.7" />
    </Base>
  );
}

export function IconLeaf(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 4.5C11.5 4 5.5 7 5.5 14a4.9 4.9 0 0 0 5 5c7 0 9.5-6.5 9.5-14.5Z" />
      <path d="M4 21c2.4-4.2 5.8-7.2 10.5-9.4" />
    </Base>
  );
}

export function IconChat(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.5 11.6a8.2 8.2 0 0 1-11.9 7.2L4 20.3l1.6-4.4a8.2 8.2 0 1 1 14.9-4.3Z" />
      <path d="M9 11.6h.01M12.5 11.6h.01M16 11.6h.01" />
    </Base>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.8" y="5.4" width="16.4" height="14.8" rx="3" />
      <path d="M8 3.5v3.6M16 3.5v3.6M4.4 10h15.2" />
      <path d="M9 14.2h2M13.4 14.2h1.8M9 17h1.6" />
    </Base>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l3 2" />
    </Base>
  );
}

export function IconGear(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.2 13.5a7.6 7.6 0 0 0 0-3l1.6-1.3-1.9-3.3-2 .8a7.7 7.7 0 0 0-2.6-1.5L14 3h-4l-.4 2.2a7.7 7.7 0 0 0-2.6 1.5l-2-.8-1.9 3.3L4.8 10.5a7.6 7.6 0 0 0 0 3l-1.6 1.3 1.9 3.3 2-.8a7.7 7.7 0 0 0 2.6 1.5L10 21h4l.4-2.2a7.7 7.7 0 0 0 2.6-1.5l2 .8 1.9-3.3-1.7-1.3Z" />
    </Base>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7.1 3.8h-.9A2.4 2.4 0 0 0 3.8 6.5c.3 4.4 2.8 8.5 6 11.4 2.8 2.6 6.2 3.1 8.2 1.1l.1-.1a2.1 2.1 0 0 0 0-3l-2.6-2.4a1.9 1.9 0 0 0-2.5-.1l-1 .8a1.4 1.4 0 0 1-1.7-.1 13.4 13.4 0 0 1-3.5-3.8 1.4 1.4 0 0 1 .2-1.6l.8-.8a1.9 1.9 0 0 0 .2-2.4L7.1 3.8Z" />
    </Base>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.8 12h16.4M12 3.6c2.2 2.3 3.3 5.2 3.3 8.4s-1.1 6.1-3.3 8.4c-2.2-2.3-3.3-5.2-3.3-8.4S9.8 5.9 12 3.6Z" />
    </Base>
  );
}

export function IconExit(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
      <path d="M10.5 8 6.5 12l4 4M6.8 12h9" />
    </Base>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19.2 12H5M11 6l-6 6 6 6" />
    </Base>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.8 12h14.2M13 6l6 6-6 6" />
    </Base>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Base>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
    </Base>
  );
}

export function IconWind(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 8.5h10a3 3 0 1 0-3-3" />
      <path d="M3.5 12.5h14a3 3 0 1 1-3 3" />
      <path d="M3.5 16.5h6" />
    </Base>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.6 12S6.4 5.8 12 5.8 21.4 12 21.4 12 17.6 18.2 12 18.2 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Base>
  );
}

export function IconNotebook(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 4.5h11a2 2 0 0 1 2 2v13H7a2.5 2.5 0 0 1-2.5-2.5v-10A2 2 0 0 1 6 4.5Z" />
      <path d="M6 4.5v15M9.5 9h6M9.5 12.5h4" />
    </Base>
  );
}
