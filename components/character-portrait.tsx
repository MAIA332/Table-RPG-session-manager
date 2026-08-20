"use client"

import Image from "next/image"
import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { normalizePortraitFrame, type PortraitFrameId } from "@/lib/portrait-frames"

interface CharacterPortraitProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  src?: string
  alt: string
  frame?: PortraitFrameId | string
  sizes?: string
}

export function CharacterPortrait({ src, alt, frame, sizes = "64px", className, ...props }: CharacterPortraitProps) {
  return (
    <div data-frame={normalizePortraitFrame(frame)} className={cn("character-portrait", className)} {...props}>
      <div className="character-portrait-image">
        <Image src={src || "/mystic-adventurer-portrait.png"} alt={alt} fill className="object-cover" sizes={sizes} />
      </div>
      <span className="character-portrait-ornament" aria-hidden="true" />
    </div>
  )
}
