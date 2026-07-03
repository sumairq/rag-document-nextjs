import type { SVGProps } from "react";

/**
 * Small, consistent line icons (1.5px stroke, 16px grid). Inline SVG keeps the
 * bundle dependency-free and lets icons inherit `currentColor`.
 */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 3.25v9.5M3.25 8h9.5" />
  </Icon>
);

export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.75 7.3c0-2.2 1.9-3.8 4.2-3.8h1.8c2.4 0 4.5 1.6 4.5 4s-2.1 4-4.5 4H6.4l-2.9 2.05a.35.35 0 0 1-.55-.3V11.4A4.1 4.1 0 0 1 2.75 8Z" />
  </Icon>
);

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M4.25 4.5l.5 8a1 1 0 0 0 1 .95h4.5a1 1 0 0 0 1-.95l.5-8" />
  </Icon>
);

export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.75 4.5h10.5M2.75 8h10.5M2.75 11.5h10.5" />
  </Icon>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Icon>
);

export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);

export const DocumentIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4.25 2.75h4l3.25 3.25v7.25a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z" />
    <path d="M8 2.75V6a.5.5 0 0 0 .5.5h3" />
    <path d="M5.75 9h4.5M5.75 11h3" />
  </Icon>
);

export const FolderIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.75 4.75c0-.55.45-1 1-1h2.3c.3 0 .6.14.8.38l.6.74h4.0c.55 0 1 .45 1 1v5.5c0 .55-.45 1-1 1H3.75c-.55 0-1-.45-1-1Z" />
  </Icon>
);

export const SparkIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 2.5c.3 2.2 1.3 3.2 3.5 3.5C9.3 6.3 8.3 7.3 8 9.5 7.7 7.3 6.7 6.3 4.5 6 6.7 5.7 7.7 4.7 8 2.5Z" />
    <path d="M12.25 9.25c.15 1.1.65 1.6 1.75 1.75-1.1.15-1.6.65-1.75 1.75-.15-1.1-.65-1.6-1.75-1.75 1.1-.15 1.6-.65 1.75-1.75Z" />
  </Icon>
);

export const ArrowUpIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 12.75V3.5M4.25 7.25 8 3.5l3.75 3.75" />
  </Icon>
);
