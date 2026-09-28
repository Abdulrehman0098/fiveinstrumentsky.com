/* ============================================================
   permissions.js — sensor + media permission orchestrator
   ============================================================ */

const Permissions = (() => {
  'use strict';

  // State: 'unknown' | 'granted' | 'denied' | 'unsupported'
  const state = {
    orientation: 'unknown',
    motion: 'unknown',
    microphone: 'unknown',
    geolocation: 'unknown',
  };

  let onStateChange = null; // callback (state) => void

  /* ---------- Capability detection ---------- */

  function detectCapabilities() {
    const caps = {
      hasOrientation: 'DeviceOrientationEvent' in window,
      hasMotion: 'DeviceMotionEvent' in window,
      hasMicrophone: 'getUserMedia' in window.navigator,
      hasGeolocation: 'geolocation' in window.navigator,
      hasBarometer: false,
      hasMagnetometer: false,
      hasPressureSensor: false,
    };

    // Check for new sensor APIs
    if (typeof Magnetometer !== 'undefined') caps.hasMagnetometer = true;
    if (typeof PressureSensor !== 'undefined') caps.hasPressureSensor = true;

    // Barometer via DeviceMotion (legacy iOS/Android)
    if (typeof DeviceMotionEvent !== 'undefined') {
      try {
        const em = new DeviceMotionEvent({ accelerationIncludingGravity: { x:0, y:0, z:0 } });
        if (em.accelerationIncludingGravity !== undefined) {
          // Barometer not directly exposed via DeviceMotion, but set flag for fallback
        }
      } catch (_) {}
    }

    return caps;
  }

  /* ---------- Permission state helpers ---------- */

  function setPermission(sensor, st) {
    if (state[sensor] !== st) {
      state[sensor] = st;
      if (onStateChange) onStateChange({ ...state });
    }
  }

  function getPermission(sensor) { return state[sensor]; }

  function allPermissions() { return { ...state }; }

  /* ---------- iOS 13+ permission request ---------- */

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function requestOrientationPermission() {
    return new Promise((resolve) => {
      const doGrant = () => { setPermission('orientation', 'granted'); resolve(true); };
      const doDeny = () => { setPermission('orientation', 'denied'); resolve(false); };

      if (!('DeviceOrientationEvent' in window)) {
        setPermission('orientation', 'unsupported');
        resolve(false);
        return;
      }

      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+
        DeviceOrientationEvent.requestPermission()
          .then(result => {
            if (result === 'granted') doGrant();
            else doDeny();
          })
          .catch(() => doDeny());
      } else {
        // Non-iOS or older iOS
        setPermission('orientation', 'granted');
        resolve(true);
      }
    });
  }

  function requestMotionPermission() {
    return new Promise((resolve) => {
      const doGrant = () => { setPermission('motion', 'granted'); resolve(true); };
      const doDeny = () => { setPermission('motion', 'denied'); resolve(false); };

      if (!('DeviceMotionEvent' in window)) {
        setPermission('motion', 'unsupported');
        resolve(false);
        return;
      }

      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
          .then(result => {
            if (result === 'granted') doGrant();
            else doDeny();
          })
          .catch(() => doDeny());
      } else {
        setPermission('motion', 'granted');
        resolve(true);
      }
    });
  }

  /* ---------- Microphone ---------- */

  function requestMicrophone() {
    return new Promise((resolve) => {
      if (!('getUserMedia' in window.navigator)) {
        setPermission('microphone', 'unsupported');
        resolve(null);
        return;
      }

      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          setPermission('microphone', 'granted');
          resolve(stream);
        })
        .catch(err => {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setPermission('microphone', 'denied');
          } else if (err.name === 'NotFoundError' || err.name === 'NoMediaCapabilities') {
            setPermission('microphone', 'unsupported');
          } else {
            setPermission('microphone', 'denied');
          }
          resolve(null);
        });
    });
  }

  /* ---------- Geolocation ---------- */

  function requestGeolocation() {
    return new Promise((resolve) => {
      if (!('geolocation' in window.navigator)) {
        setPermission('geolocation', 'unsupported');
        resolve(null);
        return;
      }

      setPermission('geolocation', 'granted');
      const onSuccess = (pos) => resolve(pos);
      const onError = (err) => {
        if (err.code === 1) setPermission('geolocation', 'denied');
        resolve(null);
      };
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      });
    });
  }

  function watchPosition(onUpdate, onError) {
    if (!('geolocation' in window.navigator)) return null;
    return navigator.geolocation.watchPosition(onUpdate, onError || (() => {}), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  }

  function clearWatch(id) {
    if (id !== null && typeof navigator.geolocation.clearWatch === 'function') {
      navigator.geolocation.clearWatch(id);
    }
  }

  /* ---------- Permission change callback ---------- */

  function onPermissionChange(fn) { onStateChange = fn; }

  /* ---------- Standard permission API query (where available) ---------- */

  async function queryAudioPermission() {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'granted') setPermission('microphone', 'granted');
        else if (result.state === 'denied') setPermission('microphone', 'denied');
        result.onchange = () => {
          setPermission('microphone', result.state === 'granted' ? 'granted' : 'denied');
        };
        return result.state;
      } catch (_) {}
    }
    return state.microphone;
  }

  async function queryGeolocationPermission() {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        if (result.state === 'granted') setPermission('geolocation', 'granted');
        else if (result.state === 'denied') setPermission('geolocation', 'denied');
        result.onchange = () => {
          setPermission('geolocation', result.state === 'granted' ? 'granted' : 'denied');
        };
        return result.state;
      } catch (_) {}
    }
    return state.geolocation;
  }

  /* ---------- Magnetometer (new API) ---------- */

  function tryStartMagnetometer(onData, onError) {
    if (typeof Magnetometer === 'undefined') {
      setPermission('orientation', 'unsupported');
      return null;
    }
    try {
      const sensor = new Magnetometer({ frequency: 60 });
      sensor.onreading = () => {
        onData({
          x: sensor.x,
          y: sensor.y,
          z: sensor.z,
          timestamp: sensor.timestamp,
        });
      };
      sensor.onerror = (err) => {
        setPermission('orientation', 'denied');
        if (onError) onError(err);
      };
      sensor.start();
      setPermission('orientation', 'granted');
      return sensor;
    } catch (err) {
      setPermission('orientation', 'denied');
      if (onError) onError(err);
      return null;
    }
  }

  function stopSensor(sensor) {
    if (sensor && typeof sensor.stop === 'function') {
      try { sensor.stop(); } catch (_) {}
    }
  }

  /* ---------- Pressure sensor (new API) ---------- */

  function tryStartPressureSensor(onData, onError) {
    if (typeof PressureSensor === 'undefined') {
      return null;
    }
    try {
      const sensor = new PressureSensor({ frequency: 10 });
      sensor.onreading = () => {
        onData({
          pressure: sensor.pressure,
          timestamp: sensor.timestamp,
        });
      };
      sensor.onerror = (err) => {
        if (onError) onError(err);
      };
      sensor.start();
      return sensor;
    } catch (err) {
      if (onError) onError(err);
      return null;
    }
  }

  /* ---------- Public API ---------- */

  return {
    detectCapabilities,
    state,
    setPermission,
    getPermission,
    allPermissions,
    isIOS,
    requestOrientationPermission,
    requestMotionPermission,
    requestMicrophone,
    requestGeolocation,
    watchPosition,
    clearWatch,
    onPermissionChange,
    queryAudioPermission,
    queryGeolocationPermission,
    tryStartMagnetometer,
    stopSensor,
    tryStartPressureSensor,
  };
})();

export default Permissions;
