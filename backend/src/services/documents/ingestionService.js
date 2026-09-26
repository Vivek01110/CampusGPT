import crypto from 'crypto';
import DocumentModel from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import { calculateFileHash } from '../ingestion/fileHasher.js';
import { processDocumentVersion } from '../ingestion/ingestionService.js';

/**
 * Ingestion Service orchestrating the full document pipeline:
 * PDF -> Validate -> Hash -> Version -> Parse -> Clean -> Chunk -> Embed -> Qdrant Index -> Atomic Switch
 * 
 * @param {string} documentId - MongoDB Document ObjectId
 * @returns {Promise<object>} Updated document record
 */
export const ingestDocument = async (documentId) => {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) {
    throw new Error(`Document with ID ${documentId} not found`);
  }

  console.log(`[INGESTION] Ingesting document: "${doc.title}" (ID: ${doc._id})`);

  // Ensure a DocumentVersion exists for this document
  let version = null;
  if (doc.currentVersionId) {
    version = await DocumentVersion.findById(doc.currentVersionId);
  }

  if (!version) {
    // Check if any version exists
    const latestVersion = await DocumentVersion.findOne({ documentId: doc._id }).sort({ versionNumber: -1 });
    const nextVerNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    let fileHash = 'unknown-hash';
    try {
      fileHash = await calculateFileHash(doc.storagePath);
    } catch (e) {
      fileHash = crypto.randomUUID();
    }

    version = await DocumentVersion.create({
      documentId: doc._id,
      versionNumber: nextVerNumber,
      fileName: doc.originalFileName,
      storagePath: doc.storagePath,
      sourceUrl: doc.sourceUrl || '',
      fileHash,
      fileSize: doc.fileSize || 0,
      mimeType: doc.mimeType || 'application/pdf',
      createdBy: doc.uploadedBy,
      processingStatus: 'validating',
      isActive: false,
    });
  }

  // Execute modular multi-stage ingestion with atomic version switching
  const result = await processDocumentVersion({
    documentId: doc._id,
    versionId: version._id,
  });

  return result.document;
};

export default {
  ingestDocument,
};


