/* Installation, verified offline files and deliberate updates. No user-library deletion. */
(function (root) {
  'use strict';
  const standalone = () => root.navigator.standalone === true || !!root.matchMedia?.('(display-mode: standalone)').matches || !!root.matchMedia?.('(display-mode: fullscreen)').matches;
  function installHelp() {
    if (standalone()) return 'StoryTouch is running as an installed app.';
    if (root.location.protocol === 'file:') return 'Open StoryTouch over HTTPS or with START-LOCAL.cmd before installing. Your browser cannot install this file directly.';
    const apple = /iPhone|iPad|iPod/.test(root.navigator.userAgent || '') || (root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1);
    return apple ? 'Open the browser’s Share menu, choose Add to Home Screen, then Add. If offered, turn on Open as Web App.' : 'Use Install StoryTouch when offered, or choose Install app / Add to Home Screen from your browser’s menu.';
  }
  function request(worker, type, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (!worker || !root.MessageChannel) { reject(new Error('Offline setup is not ready yet. Try again shortly.')); return; }
      const channel = new root.MessageChannel();
      const done = (error, value) => { root.clearTimeout(timer); channel.port1.close(); channel.port2.close(); error ? reject(error) : resolve(value); };
      const timer = root.setTimeout(() => done(new Error('The app did not respond. Close other StoryTouch tabs and reopen online.')), timeout);
      channel.port1.onmessage = event => done(null, event.data);
      try { worker.postMessage({ type }, [channel.port2]); } catch (error) { done(error); }
    });
  }
  class Runtime {
    constructor({ change, canUpdate = () => true, beforeUpdate = async () => {}, reload = () => root.location.reload() }) {
      this.change = change; this.canUpdate = canUpdate; this.beforeUpdate = beforeUpdate; this.reload = reload;
      this.state = { offline: 'checking', online: root.navigator.onLine !== false, installed: standalone(), installable: false,
        update: 'none', updateMessage: '', busy: false, help: installHelp(), message: 'Preparing offline stories…', audioCount: 0 };
      root.addEventListener('beforeinstallprompt', event => { event.preventDefault(); this.prompt = event; this.set({ installable: true }); });
      root.addEventListener('appinstalled', () => { this.prompt = null; this.set({ installed: true, installable: false, help: 'StoryTouch is installed. Open it from your home screen or app launcher.' }); });
    }
    set(patch) { Object.assign(this.state, patch); this.change({ ...this.state }); }
    async install() {
      if (!this.prompt) { this.set({ help: installHelp() }); return; }
      const prompt = this.prompt; this.prompt = null; this.set({ installable: false });
      try { await prompt.prompt(); const choice = await prompt.userChoice; this.set({ message: choice.outcome === 'accepted' ? 'Installation accepted. Your browser will finish adding StoryTouch.' : 'You can install StoryTouch later from the browser menu.' }); }
      catch (_) { this.set({ help: installHelp(), message: 'Use your browser’s Install app or Add to Home Screen option.' }); }
    }
    async init() {
      if (this.initializing) return this.initializing;
      this.initializing = this.start();
      try { return await this.initializing; } finally { this.initializing = null; }
    }
    async start() {
      this.set({});
      if (!root.isSecureContext || !root.navigator.serviceWorker || root.location.protocol === 'file:') {
        this.set({ offline: 'unsupported', message: 'Use HTTPS or localhost for installation and offline stories.' }); return;
      }
      if (!this.listening) {
        this.listening = true;
        root.addEventListener('online', () => { this.set({ online: true }); this.verify(); });
        root.addEventListener('offline', () => this.set({ online: false }));
        root.navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (this.state.update === 'applying') { if (!this.reloading) { this.reloading = true; this.reload(); } }
          else this.verify();
        });
      }
      try {
        try { this.registration = await root.navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }); }
        catch (error) { this.registration = await root.navigator.serviceWorker.getRegistration?.('./'); if (!this.registration?.active) throw error; }
        const watch = () => {
          const worker = this.registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && this.registration.waiting) this.set({ update: 'waiting' });
            if (worker.state === 'activated') this.verify();
            if (worker.state === 'redundant' && !this.registration.active) this.set({ offline: 'error', message: 'Offline download did not finish. Reconnect and try again.' });
          });
        };
        this.registration.addEventListener('updatefound', watch); watch();
        if (this.registration.waiting) this.set({ update: 'waiting' });
        let timer;
        await Promise.race([root.navigator.serviceWorker.ready.finally(() => root.clearTimeout(timer)),
          new Promise((_, reject) => { timer = root.setTimeout(() => reject(new Error('Offline files are still downloading. Keep this app open and try again shortly.')), 20000); })]);
        await this.verify();
      } catch (error) { this.set({ offline: 'error', message: error.message || 'Offline setup could not finish. Reconnect and try again.' }); }
    }
    async verify() {
      try {
        const worker = this.registration?.active || root.navigator.serviceWorker?.controller;
        const status = await request(worker, 'OFFLINE_STATUS');
        this.set({ offline: status.ready ? 'ready' : 'incomplete', audioCount: status.audioCount || 0,
          message: status.ready ? 'The app and all bundled stories are saved for offline use.' : 'Some offline files are missing. Connect and choose Download offline files.' });
        return status;
      } catch (error) { this.set({ offline: 'error', message: error.message }); return null; }
    }
    async downloadOffline() {
      if (this.state.busy) return;
      if (!this.state.online) { this.set({ message: 'Connect to the internet to download missing offline files.' }); return; }
      if (!this.registration?.active) { await this.init(); return; }
      this.set({ busy: true, message: 'Downloading offline files. Keep StoryTouch open…' });
      try {
        const status = await request(this.registration?.active, 'CACHE_OFFLINE', 60000);
        if (status.error) throw new Error(status.error);
        await this.verify();
      } catch (error) { this.set({ message: error.message }); }
      finally { this.set({ busy: false }); }
    }
    async checkUpdates() {
      if (this.state.busy) return;
      if (!this.state.online) { this.set({ message: 'You’re offline. Saved stories are available; updates can wait until you reconnect.' }); return; }
      if (!this.registration) { await this.init(); return; }
      this.set({ busy: true, message: 'Checking for an app update…' });
      try {
        await this.registration.update();
        if (this.registration.waiting) this.set({ update: 'waiting', message: 'An update is ready. Apply it when you have finished listening or recording.' });
        else this.set({ message: this.registration.installing ? 'An update is downloading. Your stories stay available.' : 'You’re using the latest available app version.' });
      } catch (_) { this.set({ message: 'Could not check for updates. Your saved stories are still here.' }); }
      finally { this.set({ busy: false }); }
    }
    async applyUpdate() {
      if (this.state.update === 'applying' || !this.registration?.waiting) return;
      if (!this.canUpdate()) { const message = 'Return to adult controls and finish recording, importing or playing before updating.'; this.set({ message, updateMessage: message }); return; }
      this.set({ busy: true });
      try {
        await this.beforeUpdate();
        if (!this.canUpdate()) throw new Error('Finish the current activity before updating.');
        this.set({ update: 'applying', updateMessage: 'Your draft is saved. Opening the updated app…', message: 'Your draft is saved. Opening the updated app…' });
        const result = await request(this.registration.waiting, 'APPLY_UPDATE');
        if (!result.ok) throw new Error(result.reason || result.error || 'The update could not be applied.');
        // Reload only on controllerchange, once the new worker is actually in control.
      } catch (error) { this.set({ update: 'waiting', message: error.message, updateMessage: error.message }); }
      finally { if (this.state.update !== 'applying') this.set({ busy: false }); }
    }
  }
  root.StoryPWA = { Runtime, request, standalone, installHelp };
})(typeof window === 'undefined' ? globalThis : window);
