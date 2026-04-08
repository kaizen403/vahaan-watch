"use client";

import React from "react";

interface VaahanLogoProps {
  className?: string;
  size?: number;
}

export function VaahanLogo({ className = "", size = 32 }: VaahanLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Vaahan Logo"
    >
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12L16 22L22 12"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="22" r="1.5" fill="currentColor" />
      <circle cx="22" cy="22" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function VaahanLogoFilled({ className = "", size = 32 }: VaahanLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Vaahan Logo"
    >
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="currentColor"
        fillOpacity="0.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12L16 22L22 12"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="22" r="1.5" fill="currentColor" />
      <circle cx="22" cy="22" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function VaahanLogoMinimal({ className = "", size = 32 }: VaahanLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Vaahan Logo"
    >
      <path
        d="M8 10L16 24L24 10"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="7" y1="26" x2="13" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="26" x2="25" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
