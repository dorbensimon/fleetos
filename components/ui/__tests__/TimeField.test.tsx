import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { TimeField } from '../TimeField';

const originalPlatform = Platform.OS;

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});

describe('TimeField on web', () => {
  it('clears the submitted value when the typed time is invalid', async () => {
    const onChange = jest.fn();
    const screen = await render(<TimeField value="12:00" onChange={onChange} />);

    fireEvent.changeText(screen.getByPlaceholderText('HH:MM'), '25:99');

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('normalizes a valid typed time before submitting it', async () => {
    const onChange = jest.fn();
    const screen = await render(<TimeField value={null} onChange={onChange} />);

    fireEvent.changeText(screen.getByPlaceholderText('HH:MM'), '9:05');

    expect(onChange).toHaveBeenLastCalledWith('09:05');
  });
});
