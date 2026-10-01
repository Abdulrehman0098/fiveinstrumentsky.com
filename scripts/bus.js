/* ============================================================
   bus.js — Event bus with sticky last-value cache
   ============================================================ */

window.FI = window.FI || {};

(function() {
'use strict';

var bus = window.FI.bus = {
  _listeners: {},
  _once: {},
  _sticky: {}
};

function on(name, fn) {
  if (!bus._listeners[name]) bus._listeners[name] = [];
  bus._listeners[name].push(fn);
}
bus.on = on;

function off(name, fn) {
  var list = bus._listeners[name];
  if (!list) return;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === fn) { list.splice(i, 1); break; }
  }
}
bus.off = off;

function once(name, fn) {
  if (!bus._once[name]) bus._once[name] = [];
  bus._once[name].push(fn);
}
bus.once = once;

function emit(name, data) {
  var list = bus._listeners[name] || [];
  for (var i = 0; i < list.length; i++) {
    try { list[i].call(null, data); } catch (e) { console.warn('bus.emit error:', e); }
  }
  bus._sticky[name] = data;
  var onceList = bus._once[name] || [];
  if (onceList.length) {
    for (var j = 0; j < onceList.length; j++) {
      try { onceList[j].call(null, data); } catch (e) { console.warn('bus.once error:', e); }
    }
    bus._once[name] = [];
  }
}
bus.emit = emit;

function getSticky(name) {
  return bus._sticky[name];
}
bus.getSticky = getSticky;

})();
