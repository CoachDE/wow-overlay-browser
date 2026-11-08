'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const send = (channel, ...args) => ipcRenderer.send(channel, ...args);

contextBridge.exposeInMainWorld('overlay', {
  navigate: (input) => send('navigate', String(input)),
  home: () => send('home'),
  back: () => send('back'),
  reload: () => send('reload'),
  setOpacity: (value) => send('set-opacity', Number(value)),
  toggleClickThrough: () => send('toggle-click-through'),
  toggleBar: () => send('toggle-bar'),
  cinema: () => send('cinema'),
  minimize: () => send('minimize'),
  toggleMaximize: () => send('toggle-maximize'),
  playPause: () => send('play-pause'),
  hide: () => send('hide'),
  close: () => send('close'),
  openSettings: () => send('open-settings'),
  shorts: () => send('shorts'),
  newTab: () => send('tab:new'),
  activateTab: (id) => send('tab:activate', id === 'yt' ? 'yt' : Number(id)),
  closeTab: (id) => send('tab:close', Number(id)),
  onFocusUrl: (callback) => {
    ipcRenderer.on('focus-url', () => callback());
  },
  // Einstellungsfenster
  getHotkeys: () => ipcRenderer.invoke('hotkeys:get'),
  testHotkey: (accel) => ipcRenderer.invoke('hotkeys:test', String(accel)),
  saveHotkeys: (map, options) => ipcRenderer.invoke('hotkeys:save', map, options),
  closeSettings: () => send('settings:close'),
  previewTheme: (id) => send('theme:preview', String(id)),
  onState: (callback) => {
    ipcRenderer.on('state', (_event, state) => callback(state));
  }
});
