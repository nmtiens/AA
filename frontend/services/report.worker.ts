/* eslint-disable no-restricted-globals */

self.onmessage = async (e: MessageEvent) => {
  const { endpoint, fieldToAggregate } = e.data;

  const request = indexedDB.open('OpsHub_Database_V7', 1);

  request.onerror = () => {
    self.postMessage({ status: 'ERROR', error: 'Không thể mở IndexedDB từ Web Worker' });
  };

  request.onsuccess = () => {
    const db = request.result;

    if (!db.objectStoreNames.contains(endpoint)) {
      self.postMessage({ status: 'ERROR', error: `Object Store [${endpoint}] không tồn tại.` });
      return;
    }

    const tx = db.transaction(endpoint, 'readonly');
    const store = tx.objectStore(endpoint);
    const cursorReq = store.openCursor();

    let totalSum = 0;
    let totalRows = 0;

    cursorReq.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        if (fieldToAggregate && cursor.value[fieldToAggregate] !== undefined) {
          const val = Number(cursor.value[fieldToAggregate]);
          if (!isNaN(val)) totalSum += val;
        }
        totalRows++;
        cursor.continue(); // Đọc cuốn chiếu giải phóng RAM
      } else {
        self.postMessage({
          status: 'SUCCESS',
          endpoint,
          result: { totalSum, totalRows }
        });
      }
    };

    cursorReq.onerror = () => {
      self.postMessage({ status: 'ERROR', error: `Lỗi đọc Cursor ở endpoint [${endpoint}]` });
    };
  };
};

export {};