"use client";

import { useEffect, useRef } from "react";

interface PdfPageViewerProps {
  blob: Blob;
  pageNumber: number;
  title: string;
}

export function PdfPageViewer({ blob, pageNumber, title }: PdfPageViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    if (frameRef.current) frameRef.current.src = `${objectUrl}#page=${pageNumber}`;
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, pageNumber]);

  return <iframe ref={frameRef} className="pdf-page-frame" title={`${title}, page ${pageNumber}`} loading="lazy" />;
}
