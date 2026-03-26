import { useCallback, useEffect, useRef, useState } from 'react';
import { createStreamSocket } from '../utils/api';

export function useWebSocket(modelName, confidenceThreshold, onMessage) {
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const manualCloseRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const disconnect = useCallback(() => {
    const activeSocket = socketRef.current;
    socketRef.current = null;
    manualCloseRef.current = true;

    if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) {
      activeSocket.close();
    }

    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      return;
    }

    manualCloseRef.current = false;
    const socket = createStreamSocket(modelName, confidenceThreshold);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      setConnected(true);
      setError(null);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onMessageRef.current?.(payload);
      } catch {
        setError('Received an unreadable stream message.');
      }
    };

    socket.onerror = () => {
      setError('WebSocket connection failed. Check the backend URL and WebSocket proxy configuration.');
    };

    socket.onclose = (event) => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setConnected(false);

      if (!manualCloseRef.current && event.code !== 1000) {
        setError(event.reason || 'WebSocket connection closed unexpectedly.');
      }
    };

    socketRef.current = socket;
  }, [confidenceThreshold, modelName]);

  const sendFrame = useCallback((frameBytes) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(frameBytes);
    }
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    connect,
    connected,
    disconnect,
    error,
    sendFrame,
  };
}
