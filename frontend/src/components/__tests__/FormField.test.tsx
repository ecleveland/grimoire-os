import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormField from '../FormField';

describe('FormField', () => {
  describe('label', () => {
    it('renders label text', () => {
      render(<FormField label="Username" value="" onChange={() => {}} />);
      expect(screen.getByText('Username')).toBeInTheDocument();
    });

    it('wires label htmlFor to input id when id prop is provided', () => {
      render(<FormField label="Email" id="email-input" value="" onChange={() => {}} />);
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('id', 'email-input');
    });

    it('auto-generates an id and wires htmlFor when id prop is not provided', () => {
      render(<FormField label="Name" value="" onChange={() => {}} />);
      const input = screen.getByLabelText('Name');
      expect(input.id).toBeTruthy();
    });

    it('generates unique ids when multiple FormFields render without explicit ids', () => {
      render(
        <>
          <FormField label="First" value="" onChange={() => {}} />
          <FormField label="Second" value="" onChange={() => {}} />
        </>
      );
      const first = screen.getByLabelText('First');
      const second = screen.getByLabelText('Second');
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('required indicator', () => {
    it('renders red asterisk when required is true', () => {
      render(<FormField label="Name" required value="" onChange={() => {}} />);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('does not render asterisk when required is false', () => {
      render(<FormField label="Name" value="" onChange={() => {}} />);
      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });

    it('forwards required attribute to the input element', () => {
      render(<FormField label="Name" required value="" onChange={() => {}} />);
      expect(screen.getByLabelText(/Name/)).toBeRequired();
    });
  });

  describe('helperText', () => {
    it('renders helper text below the input when provided', () => {
      render(
        <FormField
          label="Password"
          helperText="Min 12 chars"
          value=""
          onChange={() => {}}
        />
      );
      expect(screen.getByText('Min 12 chars')).toBeInTheDocument();
    });

    it('does not render helper text when not provided', () => {
      const { container } = render(<FormField label="Name" value="" onChange={() => {}} />);
      expect(container.querySelectorAll('p')).toHaveLength(0);
    });
  });

  describe('error state', () => {
    it('renders error message when error prop is provided', () => {
      render(
        <FormField label="Email" error="Invalid email" value="" onChange={() => {}} />
      );
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
    });

    it('hides helperText when error is present', () => {
      render(
        <FormField
          label="Email"
          helperText="We never share this"
          error="Required"
          value=""
          onChange={() => {}}
        />
      );
      expect(screen.queryByText('We never share this')).not.toBeInTheDocument();
      expect(screen.getByText('Required')).toBeInTheDocument();
    });
  });

  describe('input forwarding', () => {
    it('forwards value to the input', () => {
      render(<FormField label="Name" value="hello" onChange={() => {}} />);
      expect(screen.getByLabelText('Name')).toHaveValue('hello');
    });

    it('calls onChange when user types', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FormField label="Name" value="" onChange={onChange} />);
      await user.type(screen.getByLabelText('Name'), 'a');
      expect(onChange).toHaveBeenCalled();
    });

    it('forwards type=email', () => {
      render(<FormField label="Email" type="email" value="" onChange={() => {}} />);
      expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    });

    it('forwards type=password', () => {
      render(<FormField label="Pass" type="password" value="" onChange={() => {}} />);
      expect(screen.getByLabelText('Pass')).toHaveAttribute('type', 'password');
    });

    it('forwards type=number', () => {
      render(<FormField label="Level" type="number" value={1} onChange={() => {}} />);
      expect(screen.getByLabelText('Level')).toHaveAttribute('type', 'number');
    });

    it('forwards placeholder', () => {
      render(
        <FormField label="Name" placeholder="Enter name" value="" onChange={() => {}} />
      );
      expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument();
    });

    it('forwards disabled and applies disabled styling', () => {
      render(<FormField label="Name" disabled value="" onChange={() => {}} />);
      expect(screen.getByLabelText('Name')).toBeDisabled();
    });

    it('appends className to the input element', () => {
      render(
        <FormField label="STR" className="text-center" value="" onChange={() => {}} />
      );
      expect(screen.getByLabelText('STR')).toHaveClass('text-center');
    });

    it('forwards min and max for number inputs', () => {
      render(
        <FormField
          label="Level"
          type="number"
          min={1}
          max={20}
          value={1}
          onChange={() => {}}
        />
      );
      const input = screen.getByLabelText('Level');
      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', '20');
    });
  });

  describe('as=textarea', () => {
    it('renders a textarea when as="textarea"', () => {
      render(
        <FormField as="textarea" label="Description" value="" onChange={() => {}} />
      );
      const el = screen.getByLabelText('Description');
      expect(el.tagName).toBe('TEXTAREA');
    });

    it('forwards rows to textarea', () => {
      render(
        <FormField as="textarea" label="Bio" rows={5} value="" onChange={() => {}} />
      );
      expect(screen.getByLabelText('Bio')).toHaveAttribute('rows', '5');
    });

    it('calls onChange when user types in textarea', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <FormField as="textarea" label="Bio" value="" onChange={onChange} />
      );
      await user.type(screen.getByLabelText('Bio'), 'h');
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('as=select', () => {
    it('renders a select when as="select"', () => {
      render(
        <FormField as="select" label="Status" value="active" onChange={() => {}}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </FormField>
      );
      const el = screen.getByLabelText('Status');
      expect(el.tagName).toBe('SELECT');
    });

    it('renders the option children', () => {
      render(
        <FormField as="select" label="Visibility" value="private" onChange={() => {}}>
          <option value="private">Private</option>
          <option value="party">Party</option>
        </FormField>
      );
      expect(screen.getByRole('option', { name: 'Private' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Party' })).toBeInTheDocument();
    });

    it('reflects the selected value', () => {
      render(
        <FormField as="select" label="Status" value="paused" onChange={() => {}}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </FormField>
      );
      expect(screen.getByLabelText('Status')).toHaveValue('paused');
    });

    it('calls onChange when user selects a different option', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <FormField as="select" label="Status" value="active" onChange={onChange}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </FormField>
      );
      await user.selectOptions(screen.getByLabelText('Status'), 'paused');
      expect(onChange).toHaveBeenCalled();
    });
  });
});
