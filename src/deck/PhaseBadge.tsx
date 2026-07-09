import React from 'react';

/** Small persistent corner badge showing the current Core-Loop phase. */
export const PhaseBadge: React.FC<{ phase: string }> = ({ phase }) => (
  <div
    style={{
      position: 'absolute',
      top: 224,
      left: 192,
      zIndex: 7,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 20,
      background: 'var(--accent)',
      color: '#fff',
      fontFamily: 'var(--head)',
      fontWeight: 700,
      fontSize: 48,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      padding: '20px 46px',
      borderRadius: 999,
      boxShadow: 'var(--shadow)',
    }}
  >
    <span
      style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', opacity: 0.9, display: 'block' }}
    />
    {phase}
  </div>
);
