import { OBSTACLES, type Obstacle } from './world';
export interface BlockState extends Obstacle { material: 'wood' | 'marble' | 'bush' | 'tank' | 'oil'; hits: number; destroyed: boolean }
export function createBlockStates(): BlockState[] {
  return OBSTACLES.map((b, i) => {
    const row: BlockState['material'][] = ['wood','marble','bush','bush','tank','wood'];
    const wallMaterials: BlockState['material'][] = ['wood','marble','bush','tank','wood','marble'];
    const material = i >= 43 ? wallMaterials[Math.floor((i-43)/5)] : i >= 38 ? 'oil' : i >= 16 ? row[(i-16)%row.length] : i >= 14 ? 'tank' : i >= 10 ? 'bush' : i % 3 === 0 ? 'wood' : 'marble';
    return { ...b, material, hits: 0, destroyed: false, walkThrough: material === 'bush',
      seeThrough: material === 'tank', bulletThrough: material === 'bush', absorbsRocket: material === 'bush' };
  });
}
/** Returns true only for the hit that breaks a wooden block. */
export function damageBlock(block: BlockState, explosive = false, melee = false): boolean {
  if (block.destroyed) return false;
  if (block.material === 'bush' && !melee) return false;
  if (block.material === 'oil') {block.destroyed=true;return true;}
  if (explosive) { block.destroyed = true; return true; }
  if (block.material === 'marble') return false;
  block.hits++;
  block.destroyed = block.hits >= 3;
  return block.destroyed;
}
