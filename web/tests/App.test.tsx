import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('renders the header title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Local Rescue Bid/i })).toBeDefined();
  });

  it('shows the Upload step as active on first load', () => {
    render(<App />);
    // The first stepper item should have aria-current="step"
    const items = document.querySelectorAll('[aria-current="step"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Upload');
  });

  it('shows the upload screen heading on first load', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /upload job packet/i })).toBeDefined();
  });
});
