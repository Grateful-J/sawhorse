export type V3 = [number, number, number];
export interface Prism {
  min: V3;
  max: V3;
}
export interface Hole {
  axis: 0 | 1 | 2;
  at: number;
  inward: 1 | -1;
  center: [number, number];
  radius: number;
  depth: number;
  sides?: number;
  /** Comes out of the opposite face (`depth` is the thickness). */
  through?: boolean;
}
export interface Mesh {
  name: string;
  positions: V3[];
  faces: number[][][];
  merge_coplanar: boolean;
}
export function partMesh(name: string, size: V3, prisms?: Prism[], holes?: Hole[]): Mesh;
export function audit(mesh: Mesh): { problems: string[]; volume: number; lo: V3; hi: V3 };
