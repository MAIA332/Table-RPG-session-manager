"use client"

import Image from "next/image"
import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { normalizePortraitCrop, normalizePortraitFrame, type PortraitCrop, type PortraitFrameId } from "@/lib/portrait-frames"

interface CharacterPortraitProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  src?: string
  alt: string
  frame?: PortraitFrameId | string
  crop?: PortraitCrop
  sizes?: string
}

export function CharacterPortrait({ src, alt, frame, crop, sizes = "64px", className, ...props }: CharacterPortraitProps) {
  const normalizedCrop = normalizePortraitCrop(crop)
  return (
    <div data-frame={normalizePortraitFrame(frame)} className={cn("character-portrait", className)} {...props}>
      <div className="character-portrait-image">
        <Image
          src={src || "/mystic-adventurer-portrait.png"}
          alt={alt}
          fill
          className="object-cover transition-[transform,object-position] duration-200"
          sizes={sizes}
          draggable={false}
          style={{
            objectPosition: `${normalizedCrop.x}% ${normalizedCrop.y}%`,
            transform: `scale(${normalizedCrop.zoom})`,
            transformOrigin: `${normalizedCrop.x}% ${normalizedCrop.y}%`,
          }}
        />
      </div>
      <span className="character-portrait-ornament" aria-hidden="true" />
    </div>
  )
}
