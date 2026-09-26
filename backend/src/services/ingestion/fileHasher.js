import crypto from 'crypto';
import fs from 'fs';

/**
 * File Hasher - Generates cryptographic hashes for document files
 * Used for duplicate detection and tamper-evident versioning
 */

/**
 * Calculate SHA-256 hash of a file on disk
 * @param {string} filePath - Absolute or relative path to file
 * @returns {Promise<string>} Hexadecimal SHA-256 string
 */
export const calculateFileHash = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cannot hash non-existent file at: ${filePath}`);
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(new Error(`Failed to calculate file hash: ${err.message}`)));
  });
};

/**
 * Calculate SHA-256 hash of a buffer
 * @param {Buffer} buffer 
 * @returns {string} Hexadecimal SHA-256 string
 */
export const calculateBufferHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

export const hashBuffer = calculateBufferHash;
export const hashFile = calculateFileHash;

export default {
  calculateFileHash,
  calculateBufferHash,
  hashFile,
  hashBuffer,
};
