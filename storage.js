/* Audio Blobs stay in IndexedDB, never localStorage or a remote server. */
(function () {
  'use strict';
  let db;
  async function open() {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('storytouch', 1);
      request.onupgradeneeded = () => {
        const d = request.result;
        d.createObjectStore('stories', { keyPath: 'id' });
        d.createObjectStore('links', { keyPath: 'key' });
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
  const deleteStory = (id, links) => transact(['stories', 'links'], 'readwrite', tx => {
    tx.objectStore('stories').delete(id);
    links.filter(l => l.storyId === id).forEach(l => tx.objectStore('links').delete(l.key));
  });
  const restore = (stories, links) => transact(['stories', 'links'], 'readwrite', tx => {
    stories.forEach(s => tx.objectStore('stories').put(s));
    links.forEach(l => tx.objectStore('links').put(l));
  });
  window.StoryStore = { open, all, putStory, putLink, deleteStory, deleteLink, restore };
})();
