import crypto from 'crypto';

/**
 * Public Google Drive Client & Traversal Engine
 * 
 * Supports reading PUBLIC Google Drive folders without requiring Google OAuth or user credentials.
 * Works via:
 * 1. Google Drive API v3 using public API key (GOOGLE_DRIVE_API_KEY or GEMINI_API_KEY)
 * 2. Public folder web parser fallback if API key is not configured or lacks Drive scope.
 */

/**
 * Extract root folder ID from a public Google Drive URL
 * @param {string} url - Drive folder URL or ID
 * @returns {string|null} Folder ID
 */
export const extractFolderId = (url) => {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();

  // If already a raw ID (no slashes)
  if (/^[a-zA-Z0-9_-]{20,50}$/.test(clean)) {
    return clean;
  }

  // https://drive.google.com/drive/folders/1ABCxyz...
  const matchFolders = clean.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (matchFolders) return matchFolders[1];

  // https://drive.google.com/drive/u/0/folders/1ABCxyz...
  const matchUFolders = clean.match(/\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)/);
  if (matchUFolders) return matchUFolders[1];

  // https://drive.google.com/open?id=1ABCxyz...
  const matchIdParam = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam) return matchIdParam[1];

  return null;
};

export const extractDriveFolderId = extractFolderId;

/**
 * Extract logical metadata from a hierarchical Google Drive path
 * e.g., "Question Papers / Question Papers 2017 / B TECH / COMPUTER / SEM 7"
 * @param {string} folderPath
 * @returns {object} { year, program, branch, semester }
 */
export const extractMetadataFromFolderPath = (folderPath = '') => {
  const parts = folderPath.split('/').map((p) => p.trim());
  const pathStr = folderPath.toLowerCase();

  let year = null;
  let program = 'B.Tech';
  let branch = null;
  let semester = null;

  // 1. Detect Year (e.g. 2017, 2024, 2025)
  for (const part of parts) {
    const yearMatch = part.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      break;
    }
  }

  // 2. Detect Program
  if (pathStr.includes('m tech') || pathStr.includes('m.tech')) {
    program = 'M.Tech';
  } else if (pathStr.includes('mca')) {
    program = 'MCA';
  } else if (pathStr.includes('mba')) {
    program = 'MBA';
  } else if (pathStr.includes('phd') || pathStr.includes('ph.d')) {
    program = 'Ph.D';
  } else if (pathStr.includes('b tech') || pathStr.includes('b.tech') || pathStr.includes('btech')) {
    program = 'B.Tech';
  }

  // 3. Detect Branch
  if (pathStr.includes('computer') || pathStr.includes('cse') || pathStr.includes('co ')) {
    branch = 'Computer Engineering';
  } else if (pathStr.includes('ece') || pathStr.includes('electronics')) {
    branch = 'Electronics & Communication Engineering';
  } else if (pathStr.includes('ee ') || pathStr.includes('electrical')) {
    branch = 'Electrical Engineering';
  } else if (pathStr.includes('civil')) {
    branch = 'Civil Engineering';
  } else if (pathStr.includes('mech')) {
    branch = 'Mechanical Engineering';
  } else if (pathStr.includes('it ') || pathStr.includes('information tech')) {
    branch = 'Information Technology';
  } else if (pathStr.includes('ai ') || pathStr.includes('artificial intel')) {
    branch = 'Artificial Intelligence & Machine Learning';
  } else if (pathStr.includes('hum')) {
    branch = 'Humanities & Social Sciences';
  }

  // 4. Detect Semester (e.g. SEM 1, SEM 7, 7th Sem)
  for (const part of parts) {
    const semMatch = part.match(/\b(?:sem|semester)\s*([1-8])\b/i) || part.match(/\b([1-8])(?:st|nd|rd|th)?\s*sem/i);
    if (semMatch) {
      semester = parseInt(semMatch[1], 10);
      break;
    }
  }

  return { year, program, branch, semester };
};

export const parseMetadataFromPath = extractMetadataFromFolderPath;

/**
 * List files and folders inside a public Google Drive folder using Drive API v3
 * @param {string} folderId - Google Drive Folder ID
 * @param {string} [apiKey] - API Key
 * @returns {Promise<Array<object>>} Array of file/folder items
 */
export const listFolderItemsViaApi = async (folderId, apiKey) => {
  const items = [];
  let pageToken = null;

  const keyToUse = apiKey || process.env.GOOGLE_DRIVE_API_KEY || process.env.GEMINI_API_KEY;
  if (!keyToUse) {
    throw new Error('No Google API key configured for Drive API access');
  }

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent(
      'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,md5Checksum)'
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=100${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }&key=${keyToUse}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(`Google Drive API error: ${msg}`);
    }

    const data = await res.json();
    if (data.files && Array.isArray(data.files)) {
      for (const f of data.files) {
        items.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size, 10) : 0,
          createdTime: f.createdTime ? new Date(f.createdTime) : null,
          modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : null,
          webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          webContentLink: f.webContentLink || `https://drive.google.com/uc?export=download&id=${f.id}`,
          md5Checksum: f.md5Checksum || null,
          isFolder: f.mimeType === 'application/vnd.google-apps.folder',
          isPdf: f.mimeType === 'application/pdf' || (f.name && f.name.toLowerCase().endsWith('.pdf')),
        });
      }
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return items;
};

/**
 * Public Web Fallback: Extracts public folder contents by parsing the public folder page
 * Used when Google Drive API v3 key is not configured or reaches quota.
 * @param {string} folderId
 * @returns {Promise<Array<object>>}
 */
export const listFolderItemsViaWebFallback = async (folderId) => {
  const url = `https://drive.google.com/drive/folders/${folderId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load public folder page: HTTP ${res.status}`);
  }

  const html = await res.text();
  const items = [];
  const seenIds = new Set();

  // Primary: Google Drive embeds initial folder view data in window['_DRIVE_ivd']
  const ivdMatch = html.match(/window\['_DRIVE_ivd'\]\s*=\s*'([\s\S]*?)';/);
  if (ivdMatch) {
    try {
      const raw = ivdMatch[1];
      const unescaped = raw.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      const parsed = JSON.parse(unescaped);
      const entries = Array.isArray(parsed) && Array.isArray(parsed[0]) ? parsed[0] : [];

      for (const entry of entries) {
        if (!entry || !entry[0]) continue;
        const id = entry[0];
        if (id === folderId || seenIds.has(id)) continue;
        seenIds.add(id);

        const name = entry[2] || `Item_${id}`;
        const mimeType = entry[3] || 'application/octet-stream';
        const isFolder = mimeType === 'application/vnd.google-apps.folder';
        const isPdf =
          mimeType === 'application/pdf' || (typeof name === 'string' && name.toLowerCase().endsWith('.pdf'));

        const modifiedTimestamp = entry[10] || entry[9];
        const modifiedTime = modifiedTimestamp ? new Date(modifiedTimestamp) : null;
        const size = typeof entry[4] === 'number' ? entry[4] : 0;

        items.push({
          id,
          name,
          mimeType,
          size,
          modifiedTime,
          createdTime: null,
          webViewLink: isFolder
            ? `https://drive.google.com/drive/folders/${id}`
            : `https://drive.google.com/file/d/${id}/view`,
          webContentLink: isFolder ? null : `https://drive.google.com/uc?export=download&id=${id}`,
          isFolder,
          isPdf,
        });
      }
    } catch (parseErr) {
      console.warn(`[DRIVE CLIENT] Error parsing window['_DRIVE_ivd']: ${parseErr.message}`);
    }
  }

  // Fallback regex discovery if IVD did not return items
  if (items.length === 0) {
    const fileRegex = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/g;
    let m;
    while ((m = fileRegex.exec(html)) !== null) {
      const fileId = m[1];
      if (!seenIds.has(fileId)) {
        seenIds.add(fileId);
        items.push({
          id: fileId,
          name: `Document_${fileId}.pdf`,
          mimeType: 'application/pdf',
          size: 0,
          webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
          webContentLink: `https://drive.google.com/uc?export=download&id=${fileId}`,
          isFolder: false,
          isPdf: true,
        });
      }
    }

    const folderRegex = /https:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/g;
    while ((m = folderRegex.exec(html)) !== null) {
      const childFolderId = m[1];
      if (childFolderId !== folderId && !seenIds.has(childFolderId)) {
        seenIds.add(childFolderId);
        items.push({
          id: childFolderId,
          name: `Folder_${childFolderId}`,
          mimeType: 'application/vnd.google-apps.folder',
          size: 0,
          webViewLink: `https://drive.google.com/drive/folders/${childFolderId}`,
          isFolder: true,
          isPdf: false,
        });
      }
    }
  }

  return items;
};

let apiKeysUnsupported = false;

/**
 * Universal list folder items: tries API v3 first, then web fallback
 * @param {string} folderId
 * @returns {Promise<Array<object>>}
 */
export const listFolderItems = async (folderId) => {
  if (!apiKeysUnsupported) {
    try {
      return await listFolderItemsViaApi(folderId);
    } catch (apiErr) {
      if (
        apiErr.message.includes('API keys are not supported') ||
        apiErr.message.includes('Expected OAuth2') ||
        apiErr.message.includes('403') ||
        apiErr.message.includes('401')
      ) {
        console.warn(`[DRIVE CLIENT] API keys not supported for Drive listing. Fast-switching to public web mode for all remaining folders.`);
        apiKeysUnsupported = true;
      } else {
        console.warn(`[DRIVE CLIENT] API listing failed for folder ${folderId}: ${apiErr.message}. Trying public web fallback...`);
      }
    }
  }

  try {
    return await listFolderItemsViaWebFallback(folderId);
  } catch (fallbackErr) {
    throw new Error(`Failed to list Drive folder ${folderId}: (Fallback: ${fallbackErr.message})`);
  }
};

/**
 * Download a public Google Drive PDF buffer
 * @param {string} fileId - Google Drive File ID
 * @returns {Promise<{ buffer: Buffer, contentHash: string, size: number }>}
 */
export const downloadPublicDrivePdf = async (fileId) => {
  // Direct Google Drive download endpoint
  let downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;

  let res = await fetch(downloadUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });

  // Handle Google Drive virus scan warning for larger files
  if (res.ok) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const htmlText = await res.text();
      // Look for confirm token or direct download form action
      const confirmMatch = htmlText.match(/confirm=([0-9A-Za-z_-]+)/) || htmlText.match(/name="confirm"\s+value="([^"]+)"/);
      if (confirmMatch) {
        const confirmToken = confirmMatch[1];
        downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmToken}&authuser=0`;
        res = await fetch(downloadUrl);
      } else {
        // Try fallback uc?export=download endpoint
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        res = await fetch(downloadUrl);
      }
    }
  } else {
    // Try uc endpoint
    downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    res = await fetch(downloadUrl);
  }

  if (!res.ok) {
    throw new Error(`Failed to download Drive PDF ${fileId}: HTTP ${res.status} ${res.statusText}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  // Validate PDF magic bytes (%PDF)
  if (buffer.length < 4 || buffer.toString('ascii', 0, 4) !== '%PDF') {
    throw new Error(`Downloaded content for Drive file ${fileId} is not a valid PDF document`);
  }

  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    buffer,
    contentHash,
    size: buffer.length,
  };
};

export default {
  extractFolderId,
  extractMetadataFromFolderPath,
  listFolderItemsViaApi,
  listFolderItemsViaWebFallback,
  listFolderItems,
  downloadPublicDrivePdf,
};
