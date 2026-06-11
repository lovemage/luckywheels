export function drawTierLabel(tier: 'single' | 'multi', tierDraws: number): string {
  if (tierDraws <= 1 || tier === 'single') return '單抽';
  return `${tierDraws} 連抽`;
}
