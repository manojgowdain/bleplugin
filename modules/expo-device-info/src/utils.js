export function toUint8Array(value) {
  if (value == null) {
    return new Uint8Array();
  }

  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }

  return new Uint8Array();
}

export function toByteArray(value) {
  return Array.from(toUint8Array(value));
}

export function normalizeDevice(device) {
  return {
    id: device.id,
    name: device.name ?? null,
    connected: Boolean(device.connected),
    services: device.services,
  };
}

export function normalizeError(error, fallbackCode = 'ble_error') {
  if (typeof error === 'object' && error !== null) {
    const typedError = error;

    return {
      code: typeof typedError.code === 'string' ? typedError.code : fallbackCode,
      message:
        typeof typedError.message === 'string'
          ? typedError.message
          : 'An unexpected Bluetooth error occurred.',
      details: typedError.details ?? error,
    };
  }

  return {
    code: fallbackCode,
    message: typeof error === 'string' ? error : 'An unexpected Bluetooth error occurred.',
    details: error,
  };
}
