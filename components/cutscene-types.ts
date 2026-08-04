// components/cutscene-types.ts
export type SceneMediaType = "text" | "image" | "video";

export interface CutsceneScene {
  id: string;
  type: SceneMediaType;
  content: string;
}

export interface Cutscene {
  id: string;
  name: string;
  scenes: CutsceneScene[];
}