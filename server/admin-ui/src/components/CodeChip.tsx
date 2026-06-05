export function CodeChip({ code }: { code: string }) {
  return <code style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>LW-{code}</code>;
}
