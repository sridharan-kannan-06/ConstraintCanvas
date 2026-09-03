// Minimal inline icons drawn on the Carbon 16 pixel grid.

export function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M6.4 11.3 3.5 8.4l.9-.9 2 2 5.2-5.2.9.9z" />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="m12 4.7-.7-.7L8 7.3 4.7 4l-.7.7L7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z" />
    </svg>
  );
}

export function IconLock({ open = false }: { open?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M12 7h-1V5a3 3 0 0 0-6 0h1.2A1.8 1.8 0 0 1 9.8 5v2H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z" opacity={open ? 1 : 0} />
      <path d="M12 7h-1V5a3 3 0 0 0-6 0v2H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1ZM6.2 5a1.8 1.8 0 0 1 3.6 0v2H6.2Z" opacity={open ? 0 : 1} />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M6 6h1v6H6zm3 0h1v6H9z" />
      <path d="M2 3v1h1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4h1V3Zm2 10V4h8v9Zm2-12h4v1H6z" />
    </svg>
  );
}

export function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1.5 14.5 15 8 1.5 1.5 1.5 6.6 10 8l-8.5 1.4z" />
    </svg>
  );
}
