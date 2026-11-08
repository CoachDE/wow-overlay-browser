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
  toggleFocus: () => send('toggle-focus'),
  toggleSplit: () => send('split:toggle'),
  toggleTwitch: () => send('twitch:toggle'),
  openTwitch: (channel) => send('twitch:open', String(channel)),
  onTwitchPrompt: (callback) => {
    ipcRenderer.on('twitch-prompt', () => callback());
  },
  splitDragStart: () => send('split:drag-start'),
  splitDragEnd: () => send('split:drag-end'),
  splitReset: () => send('split:reset'),
  cinema: () => send('cinema'),
  minimize: () => send('minimize'),
  toggleMaximize: () => send('toggle-maximize'),
  playPause: () => send('play-pause'),
  setVolume: (value) => send('set-volume', Number(value)),
  toggleMute: () => send('toggle-mute'),
  hide: () => send('hide'),
  close: () => send('close'),
  openSettings: () => send('open-settings'),
  shorts: () => send('shorts'),
  newTab: () => send('tab:new'),
  updateAction: () => send('update:action'),
  toggleBookmark: () => send('bookmark:toggle'),
  openBookmark: (id, newTab) => send('bookmark:open', String(id), !!newTab),
  bookmarkMenu: (id) => send('bookmark:menu', String(id)),
  renameBookmark: (id, title) => send('bookmark:rename', String(id), String(title)),
  moveBookmark: (id, toIndex) => send('bookmark:move', String(id), Number(toIndex)),
  onEditBookmark: (callback) => {
    ipcRenderer.on('bookmark:edit', (_event, id) => callback(String(id)));
  },
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
  checkUpdates: () => send('settings:check-update'),
  // Update-Pop-up
  getUpdateInfo: () => ipcRenderer.invoke('update:get'),
  startUpdate: () => send('update:start'),
  onUpdateState: (callback) => {
    ipcRenderer.on('update-state', (_event, state) => callback(state));
  },
  onState: (callback) => {
    ipcRenderer.on('state', (_event, state) => callback(state));
  }
});
