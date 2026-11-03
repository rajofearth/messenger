import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { CALL_ENGINE_HTML } from "./callEngineHtml";

export type CallSignalKind = "offer" | "answer" | "ice" | "end";

export type CallSignal = {
  id: string;
  kind: CallSignalKind;
  payload: string;
  fromUserId: string;
  createdAt: number;
};

type Props = {
  video: boolean;
  initiator: boolean;
  muted: boolean;
  videoEnabled: boolean;
  frontCamera: boolean;
  signals: CallSignal[];
  onSignal: (kind: CallSignalKind, payload: string) => void;
  onState: (state: "connected" | "reconnecting" | "ended" | string) => void;
  onError: (message: string) => void;
};

function command(name: string, value?: boolean) {
  return `window.__messengerCommand && window.__messengerCommand(${JSON.stringify({ name, value })}); true;`;
}

function signalScript(signal: CallSignal) {
  return `window.__messengerSignal && window.__messengerSignal(${JSON.stringify(signal)}); true;`;
}

export default function CallWebView({
  video,
  initiator,
  muted,
  videoEnabled,
  frontCamera,
  signals,
  onSignal,
  onState,
  onError,
}: Props) {
  const ref = useRef<WebView>(null);
  const started = useRef(false);
  const ready = useRef(false);
  const previousFront = useRef(frontCamera);
  const delivered = useRef(new Set<string>());

  useEffect(() => {
    ref.current?.injectJavaScript(command("mute", muted));
  }, [muted]);
  useEffect(() => {
    ref.current?.injectJavaScript(command("video", videoEnabled));
  }, [videoEnabled]);
  useEffect(() => {
    if (previousFront.current !== frontCamera) {
      ref.current?.injectJavaScript(command("flip"));
    }
    previousFront.current = frontCamera;
  }, [frontCamera]);
  useEffect(() => {
    for (const signal of signals) {
      if (delivered.current.has(signal.id)) continue;
      if (!ready.current) continue;
      delivered.current.add(signal.id);
      ref.current?.injectJavaScript(signalScript(signal));
    }
  }, [signals]);

  function onMessage(event: WebViewMessageEvent) {
    let message: { type?: string; kind?: CallSignalKind; payload?: string; value?: string; message?: string };
    try {
      message = JSON.parse(event.nativeEvent.data) as typeof message;
    } catch {
      onError("The call engine returned invalid data.");
      return;
    }
    if (message.type === "loaded") {
      ready.current = true;
      ref.current?.injectJavaScript(
        `window.__messengerStart && window.__messengerStart(${JSON.stringify({ video, initiator, front: frontCamera })}); true;`,
      );
      for (const signal of signals) {
        if (delivered.current.has(signal.id)) continue;
        delivered.current.add(signal.id);
        ref.current?.injectJavaScript(signalScript(signal));
      }
    } else if (message.type === "signal" && message.kind && message.payload) {
      onSignal(message.kind, message.payload);
    } else if (message.type === "state" && message.value) {
      onState(message.value);
    } else if (message.type === "error") {
      onError(message.message || "The call engine could not start.");
    }
  }

  return (
    <WebView
      ref={ref}
      source={{ html: CALL_ENGINE_HTML, baseUrl: "https://messenger.local/" }}
      style={StyleSheet.absoluteFill}
      originWhitelist={["https://*"]}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      onMessage={onMessage}
      onLoadEnd={() => {
        if (!started.current) started.current = true;
      }}
      onError={() => onError("The call WebView could not load.")}
    />
  );
}
