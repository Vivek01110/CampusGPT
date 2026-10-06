import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import PyqDocument from '../../models/PyqDocument.js';

/**
 * Document Search Service - Metadata-driven campus document & PYQ discovery (Phase 6 & 8)
 */
class DocumentSearchService {
  /**
   * Search student PYQ papers directly from PyqDocument collection
   */
  async searchPyqs(query = '', filters = {}) {
    const mongoQuery = { status: 'approved' };

    if (filters.courseCode) {
      mongoQuery['documentMetadata.courseCode'] = new RegExp(filters.courseCode.trim(), 'i');
    }

const expandSubjectRegex = (term) => {
  if (!term) return null;
  const lower = term.toLowerCase().trim();
  if (lower === 'dbms' || lower.includes('database')) {
    return /dbms|database/i;
  }
  if (lower === 'os' || lower.includes('operating system')) {
    return /os|operating system/i;
  }
  if (lower === 'cn' || lower.includes('computer network')) {
    return /cn|computer network/i;
  }
  if (lower === 'ds' || lower === 'dsa' || lower.includes('data structure')) {
    return /data structure|dsa/i;
  }
  if (lower === 'toc' || lower.includes('automata') || lower.includes('computation')) {
    return /theory of computation|automata|toc/i;
  }
  if (lower === 'se' || lower.includes('software engineering')) {
    return /software engineering/i;
  }
  return new RegExp(term.trim(), 'i');
};

const expandBranchRegex = (branch) => {
  if (!branch) return null;
  const lower = branch.toLowerCase().trim();
  if (lower === 'cse' || lower.includes('computer')) {
    return /cse|computer/i;
  }
  if (lower === 'ece' || lower.includes('electronics')) {
    return /ece|electronics/i;
  }
  if (lower === 'it' || lower.includes('information')) {
    return /it|information technology/i;
  }
  if (lower === 'mech' || lower.includes('mechanical')) {
    return /mech|mechanical/i;
  }
  if (lower === 'civil') {
    return /civil/i;
  }
  if (lower === 'ee' || lower.includes('electrical')) {
    return /electrical|ee/i;
  }
  return new RegExp(branch.trim(), 'i');
};

    if (filters.department || filters.branch) {
      const branchRegex = expandBranchRegex(filters.department || filters.branch);
      mongoQuery.$or = [
        { 'documentMetadata.branch': branchRegex },
        { 'folderMetadata.branch': branchRegex },
      ];
    }

    if (filters.semester) {
      const sem = parseInt(filters.semester, 10);
      if (!isNaN(sem)) {
        const semFilter = [
          { 'documentMetadata.semester': sem },
          { 'folderMetadata.semester': sem },
        ];
        if (mongoQuery.$or) {
          mongoQuery.$and = [{ $or: mongoQuery.$or }, { $or: semFilter }];
          delete mongoQuery.$or;
        } else {
          mongoQuery.$or = semFilter;
        }
      }
    }

    if (filters.year) {
      const yr = parseInt(filters.year, 10);
      if (!isNaN(yr)) {
        const yearFilter = [
          { 'documentMetadata.examYear': yr },
          { 'folderMetadata.year': yr },
        ];
        if (mongoQuery.$or) {
          mongoQuery.$and = [{ $or: mongoQuery.$or }, { $or: yearFilter }];
          delete mongoQuery.$or;
        } else {
          mongoQuery.$or = yearFilter;
        }
      }
    } else if (filters.startYear && filters.endYear) {
      const rangeFilter = [
        { 'documentMetadata.examYear': { $gte: filters.startYear, $lte: filters.endYear } },
        { 'folderMetadata.year': { $gte: filters.startYear, $lte: filters.endYear } },
      ];
      if (mongoQuery.$or) {
        mongoQuery.$and = [{ $or: mongoQuery.$or }, { $or: rangeFilter }];
        delete mongoQuery.$or;
      } else {
        mongoQuery.$or = rangeFilter;
      }
    }

    if (query && query.trim()) {
      const termRegex = expandSubjectRegex(query);
      const textFilters = [
        { name: termRegex },
        { 'documentMetadata.courseName': termRegex },
        { 'documentMetadata.subject': termRegex },
        { 'documentMetadata.courseCode': termRegex },
        { driveFolderPath: termRegex },
      ];
      if (mongoQuery.$or) {
        mongoQuery.$and = [{ $or: mongoQuery.$or }, { $or: textFilters }];
        delete mongoQuery.$or;
      } else {
        mongoQuery.$or = textFilters;
      }
    }

    const pyqs = await PyqDocument.find(mongoQuery)
      .sort({ 'documentMetadata.examYear': -1, createdAt: -1 })
      .limit(15)
      .lean();

    return pyqs.map((d) => ({
      documentId: d._id.toString(),
      title: d.name || d.documentMetadata?.courseName || 'Previous Year Question Paper',
      courseCode: d.documentMetadata?.courseCode || null,
      courseName: d.documentMetadata?.courseName || null,
      program: d.documentMetadata?.program || d.folderMetadata?.program || 'B.Tech',
      branch: d.documentMetadata?.branch || d.folderMetadata?.branch || null,
      semester: d.documentMetadata?.semester || d.folderMetadata?.semester || null,
      year: d.documentMetadata?.examYear || d.folderMetadata?.year || null,
      examType: d.documentMetadata?.examType || 'END_SEM',
      examMonth: d.documentMetadata?.examMonth || null,
      questionCount: d.questionCount || 0,
      sourceUrl: d.webViewLink,
      webViewLink: d.webViewLink,
      sourceName: 'NIT KKR PYQ Drive',
      sourceType: 'student_drive',
      sourceTrust: 'community',
      totalPages: d.totalPages || 1,
      documentType: 'previous_year_paper',
      category: 'examinations',
      department: d.documentMetadata?.branch || d.folderMetadata?.branch || 'General',
    }));
  }

  /**
   * Search official campus documents by metadata & query
   * 
   * @param {string} query - Keyword search
   * @param {object} filters - { documentType, category, department, year, subject, courseCode, sourceType }
   * @returns {Promise<Array<object>>}
   */
  async searchDocuments(query = '', filters = {}) {
    // If searching for PYQs or student drive papers, query PyqDocument collection first
    const isPyqSearch =
      filters.documentType === 'previous_year_paper' ||
      filters.documentType === 'question_paper' ||
      filters.sourceType === 'student_drive';

    if (isPyqSearch) {
      let pyqResults = await this.searchPyqs(query, filters);
      // Soft metadata fallback: If no papers found for requested/profile semester,
      // search across semesters for the requested subject so relevant papers are not discarded
      if (pyqResults.length === 0 && filters.semester) {
        pyqResults = await this.searchPyqs(query, { ...filters, semester: null });
      }
      if (pyqResults.length > 0) {
        return pyqResults;
      }
    }

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

    if (filters.sourceType && filters.sourceType !== 'all') {
      mongoQuery.sourceType = filters.sourceType;
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
      sourceType: doc.sourceType || 'official_nitkkr',
      sourceTrust: doc.sourceTrust || 'official',
      sourceAuthority: doc.sourceAuthority || 'official',
      sourceUrl: doc.sourceUrl || doc.webViewLink || null,
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
