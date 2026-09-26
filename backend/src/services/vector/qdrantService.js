import dotenv from 'dotenv';
dotenv.config();

const getQdrantConfig = () => {
  const url =
    process.env.QDRANT_CLUSTER_END_POINT ||
    process.env.QDRANT_URL ||
    'http://localhost:6333';
  const apiKey =
    process.env.QDRANT_CLUSTER_API_KEY ||
    process.env.QDRANT_API_KEY ||
    '';
  const collectionName =
    process.env.QDRANT_COLLECTION_NAME || 'askcampus_documents';
  const vectorSize = parseInt(process.env.EMBEDDING_DIMENSION, 10) || 768;

  // Clean trailing slash
  const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  return {
    url: cleanUrl,
    apiKey,
    collectionName,
    vectorSize,
  };
};

/**
 * Execute request to Qdrant REST API
 */
const qdrantRequest = async (endpoint, options = {}) => {
  const { url, apiKey } = getQdrantConfig();
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'api-key': apiKey } : {}),
    ...options.headers,
  };

  const response = await fetch(`${url}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const errorDetail = data?.status?.error || response.statusText;
    throw new Error(`[Qdrant Error ${response.status}] ${errorDetail}`);
  }

  return data;
};

let indexesEnsured = false;

/**
 * Ensure the vector collection exists; create if it does not
 */
export const ensureCollection = async () => {
  const { collectionName, vectorSize } = getQdrantConfig();

  try {
    const res = await qdrantRequest(`/collections/${collectionName}`, {
      method: 'GET',
    });
    if (res?.result?.status) {
      if (!indexesEnsured) {
        await ensurePayloadIndexes();
        indexesEnsured = true;
      }
      return res.result;
    }
  } catch (err) {
    // 404 indicates collection does not exist yet
    if (err.message.includes('404') || err.message.includes('Not found')) {
      console.log(`[Qdrant] Collection '${collectionName}' not found. Initializing...`);
    } else {
      throw err;
    }
  }

  // Create collection with Cosine distance
  const createPayload = {
    vectors: {
      size: vectorSize,
      distance: 'Cosine',
    },
  };

  const createRes = await qdrantRequest(`/collections/${collectionName}`, {
    method: 'PUT',
    body: JSON.stringify(createPayload),
  });

  console.log(`[Qdrant] Collection '${collectionName}' initialized successfully.`);
  await ensurePayloadIndexes();
  return createRes.result;
};

/**
 * Ensure payload indices exist for metadata filtering in Qdrant Cloud
 */
export const ensurePayloadIndexes = async () => {
  const { collectionName } = getQdrantConfig();
  const fields = [
    { field_name: 'category', field_schema: 'keyword' },
    { field_name: 'department', field_schema: 'keyword' },
    { field_name: 'documentType', field_schema: 'keyword' },
    { field_name: 'documentId', field_schema: 'keyword' },
    { field_name: 'documentVersionId', field_schema: 'keyword' },
    { field_name: 'sourceAuthority', field_schema: 'keyword' },
    { field_name: 'isActive', field_schema: 'bool' },
    { field_name: 'year', field_schema: 'integer' },
  ];

  for (const f of fields) {
    try {
      await qdrantRequest(`/collections/${collectionName}/index`, {
        method: 'PUT',
        body: JSON.stringify(f),
      });
    } catch (err) {
      // Index might already exist or be in progress
    }
  }
};

/**
 * Upsert points into Qdrant collection
 * @param {Array<{ id: string, vector: number[], payload: object }>} points
 * @param {number} [batchSize=100] - Batch size for large document point upserts
 */
export const upsertPoints = async (points, batchSize = 100) => {
  if (!points || points.length === 0) return { operation_id: 0, status: 'completed' };

  await ensureCollection();
  const { collectionName } = getQdrantConfig();

  // Controlled batching for large PDFs (e.g. 50-200 pages yielding hundreds of chunks)
  if (points.length <= batchSize) {
    const res = await qdrantRequest(`/collections/${collectionName}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
    return res.result;
  }

  let lastResult = null;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const res = await qdrantRequest(`/collections/${collectionName}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ points: batch }),
    });
    lastResult = res.result;
  }

  return lastResult;
};

/**
 * Vector similarity search
 * @param {number[]} vector - Query embedding vector
 * @param {object} options - Search options (limit, scoreThreshold, filter)
 * @returns {Promise<Array<{ id: string, score: number, payload: object }>>}
 */
export const searchPoints = async (vector, options = {}) => {
  await ensureCollection();
  const { collectionName } = getQdrantConfig();

  const limit = options.limit || parseInt(process.env.RAG_TOP_K, 10) || 5;
  const scoreThreshold = options.scoreThreshold ?? parseFloat(process.env.RAG_MIN_SCORE || '0.45');

  const searchPayload = {
    vector,
    limit,
    with_payload: true,
    ...(scoreThreshold ? { score_threshold: scoreThreshold } : {}),
    ...(options.filter ? { filter: options.filter } : {}),
  };

  const res = await qdrantRequest(`/collections/${collectionName}/points/search`, {
    method: 'POST',
    body: JSON.stringify(searchPayload),
  });

  return res.result || [];
};

/**
 * Delete all points associated with a specific document ID
 * @param {string} documentId - MongoDB Document ObjectId string
 */
export const deletePointsByDocumentId = async (documentId) => {
  await ensureCollection();
  const { collectionName } = getQdrantConfig();

  const deleteFilter = {
    filter: {
      must: [
        {
          key: 'documentId',
          match: {
            value: documentId.toString(),
          },
        },
      ],
    },
  };

  const res = await qdrantRequest(`/collections/${collectionName}/points/delete?wait=true`, {
    method: 'POST',
    body: JSON.stringify(deleteFilter),
  });

  return res.result;
};

/**
 * Delete all points associated with a specific document version ID
 * @param {string} versionId - MongoDB DocumentVersion ObjectId string
 */
export const deletePointsByVersionId = async (versionId) => {
  await ensureCollection();
  const { collectionName } = getQdrantConfig();

  const deleteFilter = {
    filter: {
      must: [
        {
          key: 'documentVersionId',
          match: {
            value: versionId.toString(),
          },
        },
      ],
    },
  };

  const res = await qdrantRequest(`/collections/${collectionName}/points/delete?wait=true`, {
    method: 'POST',
    body: JSON.stringify(deleteFilter),
  });

  return res.result;
};

/**
 * Set points active/inactive for a specific document version
 * @param {string} versionId 
 * @param {boolean} isActive 
 */
export const setPointsActiveByVersionId = async (versionId, isActive) => {
  await ensureCollection();
  const { collectionName } = getQdrantConfig();

  try {
    const payloadUpdate = {
      payload: { isActive },
      filter: {
        must: [
          {
            key: 'documentVersionId',
            match: { value: versionId.toString() },
          },
        ],
      },
    };

    const res = await qdrantRequest(`/collections/${collectionName}/points/payload?wait=true`, {
      method: 'POST',
      body: JSON.stringify(payloadUpdate),
    });

    return res.result;
  } catch (err) {
    console.warn(`[QDRANT WARNING] Failed to set points isActive: ${err.message}`);
    return null;
  }
};

/**
 * Get Collection Statistics and Point Count
 */
export const getCollectionInfo = async () => {
  const { collectionName } = getQdrantConfig();
  return await qdrantRequest(`/collections/${collectionName}`, {
    method: 'GET',
  });
};

export default {
  ensureCollection,
  upsertPoints,
  searchPoints,
  deletePointsByDocumentId,
  deletePointsByVersionId,
  setPointsActiveByVersionId,
  getCollectionInfo,
};
