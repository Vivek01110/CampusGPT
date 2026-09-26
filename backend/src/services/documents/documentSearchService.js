import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';

/**
 * Document Search Service - Metadata-driven campus document & PYQ discovery (Phase 6)
 */
class DocumentSearchService {
  /**
   * Search official campus documents by metadata & query
   * 
   * @param {string} query - Keyword search
   * @param {object} filters - { documentType, category, department, year, subject, courseCode }
   * @returns {Promise<Array<object>>}
   */
  async searchDocuments(query = '', filters = {}) {
    const mongoQuery = {
      isDeleted: { $ne: true },
      isActive: true,
      status: 'indexed',
    };

    if (filters.documentType && filters.documentType !== 'all') {
      if (filters.documentType === 'previous_year_paper' || filters.documentType === 'question_paper') {
        mongoQuery.documentType = { $in: ['previous_year_paper', 'question_paper'] };
      } else {
        mongoQuery.documentType = filters.documentType;
      }
    }

    if (filters.category && filters.category !== 'all') {
      mongoQuery.category = filters.category;
    }

    if (filters.department && filters.department !== 'all') {
      mongoQuery.department = new RegExp(filters.department, 'i');
    }

    if (filters.year) {
      const parsedYear = parseInt(filters.year, 10);
      if (!isNaN(parsedYear)) mongoQuery.year = parsedYear;
    }

    if (filters.courseCode) {
      mongoQuery.courseCode = filters.courseCode.toUpperCase().trim();
    }

    if (filters.subject) {
      mongoQuery.subject = new RegExp(filters.subject.trim(), 'i');
    }

    if (query && query.trim()) {
      const cleanTerm = query.trim();
      const termRegex = new RegExp(cleanTerm, 'i');

      const textFilters = [
        { title: termRegex },
        { description: termRegex },
        { originalFileName: termRegex },
      ];

      if (mongoQuery.$or) {
        mongoQuery.$and = [{ $or: mongoQuery.$or }, { $or: textFilters }];
        delete mongoQuery.$or;
      } else {
        mongoQuery.$or = textFilters;
      }
    }

    const docs = await Document.find(mongoQuery)
      .populate('currentVersionId', 'versionNumber totalPages totalChunks fileHash fileSize createdAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(15)
      .lean();

    return docs.map((doc) => ({
      documentId: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      category: doc.category,
      department: doc.department,
      documentType: doc.documentType,
      sourceAuthority: doc.sourceAuthority || 'official',
      sourceUrl: doc.sourceUrl || null,
      year: doc.year,
      courseCode: doc.courseCode,
      subject: doc.subject,
      semester: doc.semester,
      currentVersionNumber: doc.currentVersionNumber || doc.currentVersionId?.versionNumber || 1,
      totalPages: doc.totalPages || doc.currentVersionId?.totalPages || 0,
      totalChunks: doc.totalChunks || doc.currentVersionId?.totalChunks || 0,
      updatedAt: doc.updatedAt,
    }));
  }
}

export const documentSearchService = new DocumentSearchService();
export default documentSearchService;
