import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { DetailRow } from '../record/RecordPage';
import { t } from '../../../lib/i18n';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

const editor = (onSave: jest.Mock) => ({
  kind: 'text' as const,
  label: 'Color',
  raw: 'red',
  validate: (v: string) => (v ? null : 'required'),
  onSave,
});

test('text row edits in place: save runs onSave, cancel and Escape drop the draft', async () => {
  const onSave = jest.fn().mockResolvedValue(null);
  const screen = await render(<DetailRow label="Color" value="red" edit={editor(onSave)} />);

  await fireEvent.press(screen.getByText('red'));
  await fireEvent.changeText(screen.getByLabelText('Color'), '');
  await fireEvent.press(screen.getByLabelText(t('common.save')));
  expect(screen.getByText('required')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Color'), 'blue');
  await fireEvent.press(screen.getByLabelText(t('common.save')));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith('blue'));
  await waitFor(() => expect(screen.queryByLabelText(t('common.save'))).toBeNull());

  await fireEvent.press(screen.getByText('red'));
  await fireEvent.press(screen.getByLabelText(t('common.cancel')));
  expect(screen.queryByLabelText(t('common.save'))).toBeNull();

  await fireEvent.press(screen.getByText('red'));
  await fireEvent(screen.getByLabelText('Color'), 'keyPress', { nativeEvent: { key: 'Escape' } });
  expect(screen.queryByLabelText(t('common.save'))).toBeNull();
  expect(onSave).toHaveBeenCalledTimes(1);
});
