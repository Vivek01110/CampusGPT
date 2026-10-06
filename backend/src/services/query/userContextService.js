import User from '../../models/User.js';

/**
 * User Context Resolution Service
 * Implements strict context precedence hierarchy:
 * 1. Explicit entities mentioned in current user message
 * 2. Recent conversation context (last turns from ChatMessage)
 * 3. Stored User Profile (MongoDB User record)
 * 4. Unknown / null
 */

/**
 * Resolve user context blending explicit query signals, conversation memory, and user profile
 * @param {object} queryEntities - Entities dynamically extracted from current user message
 * @param {object|null} user - Authenticated user document
 * @param {Array<object>} recentMessages - Last 2-5 chat messages for conversation continuity
 * @returns {object} { resolvedEntities, entitySources, userProfile }
 */
export const resolveUserContext = (queryEntities = {}, user = null, recentMessages = []) => {
  const resolvedEntities = { ...queryEntities };
  const entitySources = {};

  // Mark all explicit query entities
  for (const [key, val] of Object.entries(queryEntities)) {
    if (val !== null && val !== undefined && val !== '') {
      entitySources[key] = 'current_query';
    }
  }

  // 1. Fall back to Stored User Profile
  if (user) {
    // Branch / Department
    if (!resolvedEntities.branch && (user.branch || user.department)) {
      resolvedEntities.branch = user.branch || (user.department?.includes('Computer') ? 'CSE' : user.department);
      entitySources.branch = 'profile';
    }
    if (!resolvedEntities.department && user.department) {
      resolvedEntities.department = user.department;
      entitySources.department = 'profile';
    }

    // Program / Degree
    if (!resolvedEntities.program && (user.program || user.degree)) {
      resolvedEntities.program = user.program || user.degree || 'B.Tech';
      entitySources.program = 'profile';
    }
    if (!resolvedEntities.degree && (user.degree || user.program)) {
      resolvedEntities.degree = user.degree || user.program || 'B.Tech';
      entitySources.degree = 'profile';
    }

    // Semester (derived from user.semester or user.year)
    if (!resolvedEntities.semester) {
      if (typeof user.semester === 'number' && user.semester > 0) {
        resolvedEntities.semester = user.semester;
        entitySources.semester = 'profile';
      } else if (user.year) {
        const yearMatch = String(user.year).match(/([1-4])/);
        if (yearMatch) {
          const yr = parseInt(yearMatch[1], 10);
          resolvedEntities.semester = yr * 2 - 1;
          entitySources.semester = 'profile';
        }
      }
    }

    // Academic Year
    if (!resolvedEntities.academicYear && user.academicYear) {
      resolvedEntities.academicYear = user.academicYear;
      entitySources.academicYear = 'profile';
    }

    // Campus
    if (!resolvedEntities.campus && user.campus) {
      resolvedEntities.campus = user.campus;
      entitySources.campus = 'profile';
    }
  }

  // 2. Fall back to Recent Conversation Context for missing entities (e.g., previous turn mentioned CSE or 5th sem)
  if (Array.isArray(recentMessages) && recentMessages.length > 0) {
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      if (msg.role === 'user' && msg.content) {
        const text = msg.content;
        
        // Check for course / subject mentioned in previous message
        if (!resolvedEntities.subject) {
          const prevSubjectMatch = text.match(/\b(dbms|operating systems|computer networks|data structures|algorithms|compiler design|machine learning|software engineering)\b/i);
          if (prevSubjectMatch) {
            resolvedEntities.subject = prevSubjectMatch[1].toUpperCase();
            entitySources.subject = 'conversation';
          }
        }

        // Check for semester mentioned in previous message
        if (!resolvedEntities.semester) {
          const prevSemMatch = text.match(/\b([1-8])(?:st|nd|rd|th)?\s*(?:semester|sem)\b/i);
          if (prevSemMatch) {
            resolvedEntities.semester = parseInt(prevSemMatch[1], 10);
            entitySources.semester = 'conversation';
          }
        }

        // Check for branch mentioned in previous message
        if (!resolvedEntities.branch) {
          const prevBranchMatch = text.match(/\b(cse|ece|it|mech|mechanical|civil|electrical|ee)\b/i);
          if (prevBranchMatch) {
            resolvedEntities.branch = prevBranchMatch[1].toUpperCase();
            entitySources.branch = 'conversation';
          }
        }
      }
    }
  }

  return {
    resolvedEntities,
    entitySources,
    userProfile: user ? {
      name: user.name,
      department: user.department,
      branch: user.branch,
      program: user.program,
      degree: user.degree,
      semester: user.semester,
      year: user.year,
      campus: user.campus,
    } : null,
  };
};

/**
 * Checks if the user's message is an explicit request to update their stored profile
 * e.g., "I'm now in 6th semester", "Update my branch to ECE", "Remember that I am a B.Tech CSE student"
 * @param {string} query
 * @param {object} entities
 * @returns {object|null} Updates to apply to user model, or null
 */
export const detectProfileUpdateRequest = (query = '', entities = {}) => {
  if (!query) return null;
  const lower = query.toLowerCase().trim();

  const isExplicitUpdate =
    /\b(i['’]?m now in|i am now in|update my|change my|set my|remember that i['’]?m|remember that i am)\b/i.test(lower);

  if (!isExplicitUpdate) return null;

  const updates = {};

  // Check semester update
  const semMatch = lower.match(/\b([1-8])(?:st|nd|rd|th)?\s*(?:semester|sem)\b/i);
  if (semMatch) {
    const s = parseInt(semMatch[1], 10);
    updates.semester = s;
    const yearNum = Math.ceil(s / 2);
    updates.year = `${yearNum}${yearNum === 1 ? 'st' : yearNum === 2 ? 'nd' : yearNum === 3 ? 'rd' : 'th'} Year`;
  }

  // Check branch update
  const branchMatch = lower.match(/\b(cse|ece|it|mechanical|mech|civil|electrical|ee)\b/i);
  if (branchMatch) {
    updates.branch = branchMatch[1].toUpperCase();
  }

  // Check degree update
  if (/\b(b\.?tech|bachelor)\b/i.test(lower)) {
    updates.degree = 'B.Tech';
    updates.program = 'B.Tech';
  } else if (/\b(m\.?tech|master)\b/i.test(lower)) {
    updates.degree = 'M.Tech';
    updates.program = 'M.Tech';
  } else if (/\b(ph\.?d|phd)\b/i.test(lower)) {
    updates.degree = 'PhD';
    updates.program = 'PhD';
  }

  return Object.keys(updates).length > 0 ? updates : null;
};

export default {
  resolveUserContext,
  detectProfileUpdateRequest,
};
