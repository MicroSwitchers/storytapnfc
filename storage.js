/* Audio Blobs stay in IndexedDB, never localStorage or a remote server. */
(function () {
  'use strict';
  let db;
  async function open() {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('storytouch', 2);
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains('stories')) d.createObjectStore('stories', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('links')) d.createObjectStore('links', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other StoryTouch tabs, then reload to open your library.'));
    });
    db.onversionchange = () => db.close();
  }
  function transact(stores, mode, action) {
    return new Promise((resolve, reject) => {
      if (!db) { reject(new Error('Local storage is unavailable. Try a regular browser window with site storage enabled.')); return; }
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Could not save. Check this device’s available storage.'));
      tx.onabort = () => reject(tx.error || new Error('The storage operation was cancelled.'));
      try { result = action(tx); } catch (e) { tx.abort(); reject(e); }
    });
  }
  async function all(store) {
    let rows;
    await transact([store], 'readonly', tx => { const r = tx.objectStore(store).getAll(); r.onsuccess = () => { rows = r.result; }; });
    return rows;
  }
  const putStory = story => transact(['stories'], 'readwrite', tx => tx.objectStore('stories').put(story));
  const putLink = link => transact(['links'], 'readwrite', tx => tx.objectStore('links').put(link));
  const deleteLink = key => transact(['links'], 'readwrite', tx => tx.objectStore('links').delete(key));
  const deleteStory = (id, links, removedExamples) => transact(['stories', 'links', 'settings'], 'readwrite', tx => {
    tx.objectStore('stories').delete(id);
    links.filter(l => l.storyId === id).forEach(l => tx.objectStore('links').delete(l.key));
    if (removedExamples) tx.objectStore('settings').put({ key: 'removed-examples', value: removedExamples });
  });
  const restore = (stories, links, removedExamples = [], removeIds = []) => transact(['stories', 'links', 'settings'], 'readwrite', tx => {
    removeIds.forEach(id => tx.objectStore('stories').delete(id));
    const cursor = tx.objectStore('links').openCursor();
    cursor.onsuccess = () => { const c = cursor.result; if (c) { if (removeIds.includes(c.value.storyId)) c.delete(); c.continue(); } };
    stories.forEach(s => tx.objectStore('stories').put(s));
    links.forEach(l => tx.objectStore('links').put(l));
    tx.objectStore('settings').put({ key: 'removed-examples', value: removedExamples });
  });
  const putSetting = (key, value) => transact(['settings'], 'readwrite', tx => tx.objectStore('settings').put({ key, value }));
  async function getSetting(key, fallback = null) { return (await all('settings')).find(row => row.key === key)?.value ?? fallback; }
  window.StoryStore = { open, all, putStory, putLink, deleteStory, deleteLink, restore, getSetting, putSetting };
})();
