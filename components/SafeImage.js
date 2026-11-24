'use client';

export default function SafeImage({ src, alt, className, style, fallbackId, isCardImage }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt || ''}
      className={className}
      style={style}
      referrerPolicy="no-referrer"
      onError={(e) => {
        try {
          if (isCardImage) {
            const parent = e.currentTarget.parentElement;
            if (parent) parent.style.display = 'none';
            if (parent?.nextElementSibling) {
              const badgeRow = parent.nextElementSibling.querySelector('.preview-card-badge-row');
              if (badgeRow) badgeRow.style.display = 'flex';
            }
          } else if (fallbackId) {
            const parent = e.currentTarget.parentElement;
            if (parent) parent.style.display = 'none';
            const fb = document.getElementById(fallbackId);
            if (fb) fb.style.display = 'block';
          } else {
            e.currentTarget.style.display = 'none';
          }
        } catch (_) {}
      }}
    />
  );
}
