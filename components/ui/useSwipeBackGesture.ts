import { useRef } from 'react';
import { Dimensions, PanResponder } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * The app reads right-to-left, so "swipe back" should too — but native
 * stack's built-in gesture is LTR only (drag from the left edge, moving
 * right) and can't be flipped without forcing real RTL layout, which
 * would double-mirror every screen already built with manual
 * `row-reverse` styling. This is a plain PanResponder instead: it only
 * claims the gesture once a drag is clearly horizontal and moving
 * right-to-left, so taps, buttons and vertical scrolling are untouched.
 */
export function useSwipeBackGesture() {
  const navigation = useNavigation();

  const responder = useRef(
    PanResponder.create({
      // Claims responder status only for a deliberate right-to-left drag —
      // checking direction here (not just in onPanResponderRelease) matters
      // because claiming steals the touch from whatever child is mid-press
      // (e.g. a card's TouchableOpacity), cancelling its tap. A low
      // threshold or an either-direction check would misfire on ordinary
      // taps, since a finger drifts a few px in a random direction on
      // press even when the user isn't swiping at all.
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        return gesture.dx < -22 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2.2;
      },
      onPanResponderRelease: (_evt, gesture) => {
        const pastThreshold = gesture.dx < -SCREEN_WIDTH * 0.25;
        const fastFlick = gesture.dx < -40 && gesture.vx < -0.5;
        if ((pastThreshold || fastFlick) && navigation.canGoBack()) {
          navigation.goBack();
        }
      },
    })
  ).current;

  return responder.panHandlers;
}
