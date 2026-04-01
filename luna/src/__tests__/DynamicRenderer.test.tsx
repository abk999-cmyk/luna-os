import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DynamicRenderer } from '../renderer/DynamicRenderer';
import { registerBuiltinComponents } from '../renderer/ComponentRegistry';
import type { AppDescriptor } from '../renderer/types';

// Mock the eventBridge
vi.mock('../renderer/eventBridge', () => ({
  createEventHandler: vi.fn(() => vi.fn()),
  dispatchAppEvent: vi.fn(),
}));

beforeAll(() => {
  registerBuiltinComponents();
});

describe('DynamicRenderer', () => {
  const baseSpec: AppDescriptor = {
    version: '1.0',
    type: 'application',
    id: 'test-app',
    title: 'Test App',
    layout: 'vertical',
    components: [],
  };

  it('renders empty app without crashing', () => {
    const { container } = render(
      <DynamicRenderer spec={baseSpec} dataContext={{}} appId="test" />
    );
    expect(container.querySelector('.luna-dynamic-app')).toBeTruthy();
  });

  it('renders components from spec', () => {
    const spec: AppDescriptor = {
      ...baseSpec,
      components: [
        { id: 'btn1', type: 'Button', props: { label: 'Click Me' } },
      ],
    };
    render(<DynamicRenderer spec={spec} dataContext={{}} appId="test" />);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('shows error for unknown component type', () => {
    const spec: AppDescriptor = {
      ...baseSpec,
      components: [
        { id: 'x1', type: 'NonExistent', props: {} },
      ],
    };
    render(<DynamicRenderer spec={spec} dataContext={{}} appId="test" />);
    expect(screen.getByText(/Unknown component: NonExistent/)).toBeInTheDocument();
  });

  it('resolves data bindings from context', () => {
    const spec: AppDescriptor = {
      ...baseSpec,
      components: [
        { id: 's1', type: 'Stat', props: { label: 'Count', value: '$.count' } },
      ],
    };
    render(
      <DynamicRenderer spec={spec} dataContext={{ count: 42 }} appId="test" />
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
