(() => {
  const DB_NAME = "bagibill-images";
  const STORE_NAME = "receipts";
  const MAX_RAW_SIZE = 10 * 1024 * 1024;
  const MAX_WIDTH = 1200;
  const JPEG_QUALITY = 0.7;
  let dbPromise = null;

  function initImageStore() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB tidak tersedia."));
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error("IndexedDB tidak bisa dibuka."));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error("IndexedDB diblokir."));
      };
    });

    return dbPromise;
  }

  function withStore(mode, callback) {
    return initImageStore().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, mode);
          const store = tx.objectStore(STORE_NAME);
          let request;

          try {
            request = callback(store);
          } catch (error) {
            reject(error);
            return;
          }

          if (request) {
            request.onerror = () => reject(request.error);
          }
          tx.oncomplete = () => resolve(request?.result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        }),
    );
  }

  function saveImage(blob) {
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = { id, blob, createdAt: Date.now() };
    return withStore("readwrite", (store) => store.put(record))
      .then(() => id)
      .catch((error) => {
        if (error?.name === "QuotaExceededError") {
          throw new Error("Penyimpanan foto penuh. Hapus foto lama dulu.");
        }
        throw error;
      });
  }

  function getImageURL(id) {
    if (!id) return Promise.resolve(null);
    return withStore("readonly", (store) => store.get(id)).then((record) => (record?.blob ? URL.createObjectURL(record.blob) : null));
  }

  function deleteImage(id) {
    if (!id) return Promise.resolve();
    return withStore("readwrite", (store) => store.delete(id)).then(() => undefined);
  }

  function getImageStorageBytes() {
    return initImageStore().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          let total = 0;
          const request = store.openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
              resolve(total);
              return;
            }
            total += Number(cursor.value?.blob?.size) || 0;
            cursor.continue();
          };
          request.onerror = () => reject(request.error);
          tx.onerror = () => reject(tx.error);
        }),
    );
  }

  function clearAllImages() {
    return withStore("readwrite", (store) => store.clear()).then(() => undefined);
  }

  function compressImage(file) {
    if (!file || !file.type?.startsWith("image/")) {
      return Promise.reject(new Error("Foto tidak bisa diproses. Coba foto lain."));
    }
    if (file.size > MAX_RAW_SIZE) {
      return Promise.reject(new Error("Foto terlalu besar. Maksimal 10MB."));
    }

    return createImageBitmapFromFile(file).then(
      (image) =>
        new Promise((resolve, reject) => {
          const scale = Math.min(1, MAX_WIDTH / image.width);
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Foto tidak bisa diproses. Coba foto lain."));
            return;
          }
          context.drawImage(image, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Foto tidak bisa diproses. Coba foto lain."));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            JPEG_QUALITY,
          );
        }).finally(() => {
          if (typeof image.close === "function") image.close();
        }),
    );
  }

  function createImageBitmapFromFile(file) {
    if ("createImageBitmap" in window) {
      return createImageBitmap(file).catch(() => loadImageElement(file));
    }
    return loadImageElement(file);
  }

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Foto tidak bisa diproses. Coba foto lain."));
      };
      image.src = url;
    });
  }

  function isAvailable() {
    return initImageStore()
      .then(() => true)
      .catch(() => false);
  }

  window.BillImageStore = {
    clearAllImages,
    compressImage,
    deleteImage,
    getImageStorageBytes,
    getImageURL,
    initImageStore,
    isAvailable,
    saveImage,
  };
})();
