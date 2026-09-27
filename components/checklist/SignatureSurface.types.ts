export type SignatureSurfaceProps = {
  /** A cropped transparent PNG (data URL) once there is enough ink to count as a signature, otherwise null. */
  onChange: (png: string | null, inkLength: number) => void;
  /** True while a finger is down, so a page can hold its scroll still. */
  onDrawing?: (active: boolean) => void;
  /** Changing it wipes the pad. */
  clearKey: number;
  label: string;
};
