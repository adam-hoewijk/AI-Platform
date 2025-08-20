import React, { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

type DropzoneProps = {
  accept?: string;
  maxFiles?: number;
  className?: string;
  onFiles: (files: File[]) => void;
};

function Dropzone({ accept, maxFiles = 1, className, onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const arr = Array.from(files).slice(0, maxFiles);
      onFiles(arr);
    },
    [maxFiles, onFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const items = e.dataTransfer.files;
      if (!items) return;
      const arr = Array.from(items).slice(0, maxFiles);
      onFiles(arr);
    },
    [maxFiles, onFiles]
  );

  const onClick = useCallback(() => inputRef.current?.click(), []);

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={cn(
        "w-full cursor-pointer rounded-md border-2 border-dashed border-muted/60 bg-muted/20 p-6 text-center",
        "hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring",
        className
      )}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={onChange} className="hidden" />
      <div className="flex flex-col items-center justify-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round"></path>
          <polyline points="7 10 12 5 17 10" strokeLinecap="round" strokeLinejoin="round"></polyline>
          <line x1="12" y1="5" x2="12" y2="18" strokeLinecap="round" strokeLinejoin="round"></line>
        </svg>
        <div className="text-sm font-medium">Drop a PDF here, or click to browse</div>
        <div className="text-xs text-muted-foreground">Accepted: {accept ?? "any"}</div>
      </div>
    </div>
  );
}

export { Dropzone };
