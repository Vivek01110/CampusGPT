/**
 * Query Analyzer for Campus Assistant
 * Re-exports the unified, modular analyzer from services/query/queryAnalyzer.js
 * Ensures consistent entity decomposition, terminology normalization, and query expansion across all subsystems.
 */

export { analyzeQuery, expandQuery } from '../query/queryAnalyzer.js';
import { analyzeQuery } from '../query/queryAnalyzer.js';

export default {
  analyzeQuery,
};
