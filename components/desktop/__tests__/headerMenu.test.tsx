import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { HeaderMenuProvider, useHeaderMenu } from '../headerMenu';

function Menu({ id }: { id: string }) {
  const menu = useHeaderMenu(id);
  return (
    <>
      <Pressable onPress={menu.toggle} testID={`toggle-${id}`} />
      {menu.open && <Text>{`open-${id}`}</Text>}
    </>
  );
}

test('only one top-bar dropdown is open at a time', async () => {
  const screen = await render(
    <HeaderMenuProvider>
      <Menu id="attention" />
      <Menu id="notifications" />
    </HeaderMenuProvider>,
  );
  await fireEvent.press(screen.getByTestId('toggle-attention'));
  expect(screen.queryByText('open-attention')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('toggle-notifications'));
  expect(screen.queryByText('open-notifications')).toBeTruthy();
  expect(screen.queryByText('open-attention')).toBeNull();

  await fireEvent.press(screen.getByTestId('toggle-notifications'));
  expect(screen.queryByText('open-notifications')).toBeNull();
});
