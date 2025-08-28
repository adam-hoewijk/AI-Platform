"use client";

import React, { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { UploadIcon } from "@radix-ui/react-icons";

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
                <UploadIcon className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm font-medium">Drop a PDF here, or click to browse</div>
                <div className="text-xs text-muted-foreground">Accepted: {accept ?? "any"}</div>
            </div>
        </div>
    );
}

export { Dropzone };