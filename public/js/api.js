async function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

export const api = {
  catalog: () => req('GET', '/api/catalog'),
  content: (id, from = 0, retry = false) => req('GET', `/api/books/${encodeURIComponent(id)}/content?from=${from}${retry ? '&retry=1' : ''}`),
  audiobook: (id) => req('GET', `/api/books/${encodeURIComponent(id)}/audiobook`),
  saveAudiobook: (id) => req('POST', `/api/books/${encodeURIComponent(id)}/audiobook/offline`),
  removeAudiobook: (id) => req('DELETE', `/api/books/${encodeURIComponent(id)}/audiobook/offline`),
  createUpload: (payload) => req('POST', '/api/uploads', payload),
  updateUpload: (id, payload) => req('PUT', `/api/uploads/${encodeURIComponent(id)}`, payload),
  deleteUpload: (id) => req('DELETE', `/api/uploads/${encodeURIComponent(id)}`),
  deleteFile: (id, file) => req('DELETE', `/api/uploads/${encodeURIComponent(id)}/files/${encodeURIComponent(file)}`),

  /** Uploads a raw file (cover | original | audio) with progress (0..1). */
  putFile(id, kind, file, name, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/uploads/${encodeURIComponent(id)}/${kind}?name=${encodeURIComponent(name || file.name || kind)}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(file);
    });
  },
};
