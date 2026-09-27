import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SIGNATURE_INK_JS } from './signatureInk';
import type { SignatureSurfaceProps } from './SignatureSurface.types';

/**
 * The signature surface on the phone: the web pad's own canvas code in a
 * small local WebView, so a finger draws the same smooth line everywhere.
 * Nothing is loaded from the network.
 */
const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}</style></head>
<body><canvas id="c"></canvas><script>
${SIGNATURE_INK_JS}
function post(msg){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
window.pad = createInk(document.getElementById('c'),
  function (png, length) { post({ type: 'ink', png: png, length: length }); },
  function (active) { post({ type: 'drawing', active: active }); });
true;
</script></body></html>`;

export function SignatureSurface({ onChange, onDrawing, clearKey, label }: SignatureSurfaceProps) {
  const webRef = useRef<WebView>(null);
  const source = useMemo(() => ({ html: HTML }), []);

  const firstClear = useRef(true);
  useEffect(() => {
    if (firstClear.current) {
      firstClear.current = false;
      return;
    }
    webRef.current?.injectJavaScript('window.pad && window.pad.clear(); true;');
  }, [clearKey]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; png?: string | null; length?: number; active?: boolean };
      if (message.type === 'ink') onChange(typeof message.png === 'string' && message.png.startsWith('data:image/png;base64,') ? message.png : null, message.length ?? 0);
      if (message.type === 'drawing') onDrawing?.(!!message.active);
    } catch {
      // Ignore anything that is not the pad's own message.
    }
  };

  return (
    <WebView
      ref={webRef}
      source={source}
      originWhitelist={['about:*']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={(request) => request.url.startsWith('about:')}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      javaScriptEnabled
      setSupportMultipleWindows={false}
      style={styles.web}
      containerStyle={StyleSheet.absoluteFill}
      accessibilityLabel={label}
    />
  );
}

const styles = StyleSheet.create({
  web: { backgroundColor: 'transparent' },
});
