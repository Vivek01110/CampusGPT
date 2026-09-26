import fs from 'fs';
import path from 'path';

/**
 * Storage Service - Modular file storage abstraction
 * Isolates physical disk I/O to enable seamless migration to S3 / Object Storage later
 */
class StorageService {
  constructor() {
    this.uploadDir = path.resolve('uploads/documents');
    this.ensureDirectoryExists(this.uploadDir);
  }

  /**
   * Ensure target directory exists on disk
   * @param {string} dirPath 
   */
  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Save uploaded buffer or file to destination
   * @param {string} sourcePath - Path where multer saved the temporary file
   * @param {string} destinationFileName - Target filename
   * @returns {Promise<{ storagePath: string, fileName: string, fileSize: number }>}
   */
  async saveFile(source, destinationFileName) {
    this.ensureDirectoryExists(this.uploadDir);
    const targetPath = path.join(this.uploadDir, destinationFileName);

    if (Buffer.isBuffer(source)) {
      fs.writeFileSync(targetPath, source);
      return {
        storagePath: targetPath,
        fileName: destinationFileName,
        fileSize: source.length,
      };
    }

    // If source is already the target path
    if (source === targetPath && fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      return {
        storagePath: targetPath,
        fileName: destinationFileName,
        fileSize: stats.size,
      };
    }

    // Copy or rename file to target location
    fs.copyFileSync(source, targetPath);
    const stats = fs.statSync(targetPath);

    return {
      storagePath: targetPath,
      fileName: destinationFileName,
      fileSize: stats.size,
    };
  }

  /**
   * Check if file exists in storage
   * @param {string} filePath 
   * @returns {boolean}
   */
  exists(filePath) {
    if (!filePath) return false;
    return fs.existsSync(filePath);
  }

  /**
   * Delete file from storage
   * @param {string} filePath 
   * @returns {Promise<boolean>}
   */
  async deleteFile(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.warn(`[STORAGE WARNING] Failed to delete file ${filePath}: ${err.message}`);
      return false;
    }
  }

  /**
   * Read file buffer
   * @param {string} filePath 
   * @returns {Buffer}
   */
  readFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at: ${filePath}`);
    }
    return fs.readFileSync(filePath);
  }
}

export const storageService = new StorageService();
export default storageService;
